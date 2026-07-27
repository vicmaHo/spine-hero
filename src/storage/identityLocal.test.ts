/**
 * Property 6: El acceso concedido deja store y almacén local coherentes
 * (parte del Almacen_Local_Identidad).
 *
 * `identityLocal.ts` no recibe un cliente inyectado: llama directamente a
 * `getLocalIdentityRecord`/`saveLocalIdentityRecord`/`clearLocalIdentityRecord`
 * de `./db`. Este fichero sustituye `./db` por el doble `fakeLocalIdentity`
 * (lectura/escritura en memoria, con fallos y retardos inyectables) vía
 * `vi.mock`, y testea el contrato real de `identityLocal.ts` contra ese doble.
 *
 * A este nivel de módulo, «coherencia entre store y almacén local» se reduce
 * a: lo que se guarda es exactamente lo que se lee de vuelta (round trip), sin
 * retraso ni transformación, y el correo nunca aparece en lo persistido. La
 * coherencia entre el campo `identity` del store de Zustand y este almacén la
 * cubre la Tarea 9 (fuera del alcance de este fichero).
 *
 * Validates: Requirements 1.5, 4.1, 4.3, 4.6, 5.3, 9.8
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LocalIdentityRecord } from './db';
import type { ActiveIdentity } from './identityErrors';
import {
  DEFAULT_SEED,
  CASES_PER_PROPERTY,
  createRng,
  randInt,
  genNickCandidate,
  type Rng,
} from './__tests__/gen';
import { createFakeLocalIdentity, type FakeLocalIdentity } from './__tests__/fakeLocalIdentity';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const dbMocks = vi.hoisted(() => ({
  getLocalIdentityRecord: vi.fn(),
  saveLocalIdentityRecord: vi.fn(),
  clearLocalIdentityRecord: vi.fn(),
}));

vi.mock('./db', () => dbMocks);

import { loadLocalIdentity, saveLocalIdentity, clearLocalIdentity } from './identityLocal';

function wireFake(fake: FakeLocalIdentity): void {
  dbMocks.getLocalIdentityRecord.mockImplementation(fake.getLocalIdentityRecord);
  dbMocks.saveLocalIdentityRecord.mockImplementation(fake.saveLocalIdentityRecord);
  dbMocks.clearLocalIdentityRecord.mockImplementation(fake.clearLocalIdentityRecord);
}

beforeEach(() => {
  wireFake(createFakeLocalIdentity());
});

// ─── Generador de ActiveIdentity ────────────────────────────────────────────

/** Nick válido: reintenta `genNickCandidate` hasta obtener uno que cumpla el patrón. */
function genValidNick(rng: Rng): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = genNickCandidate(rng);
    const trimmed = candidate.trim();
    if (/^[A-Za-z0-9_-]{3,16}$/.test(trimmed)) {
      return trimmed;
    }
  }
  // Fallback determinista si 50 intentos no dieron un nick válido: no debería
  // ocurrir con la semilla fija, pero evita un bucle infinito si cambiara.
  return 'nick-de-respaldo';
}

/** Id de identidad tipo UUID v4, suficiente para probar coherencia de datos opacos. */
function genUserIdentityId(rng: Rng): string {
  const hex = () => randInt(rng, 0, 15).toString(16);
  const block = (len: number) => Array.from({ length: len }, hex).join('');
  return `${block(8)}-${block(4)}-4${block(3)}-a${block(3)}-${block(12)}`;
}

function genActiveIdentity(rng: Rng): ActiveIdentity {
  return { nick: genValidNick(rng), userIdentityId: genUserIdentityId(rng) };
}

// ─── Property 6 ─────────────────────────────────────────────────────────────

describe('Property 6: el acceso concedido deja el Almacen_Local_Identidad coherente', () => {
  it(`save() seguido de load() devuelve exactamente la identidad guardada, en ${CASES_PER_PROPERTY} casos generados (semilla ${DEFAULT_SEED})`, async () => {
    const rng = createRng(DEFAULT_SEED);
    const cases: ActiveIdentity[] = [];
    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      cases.push(genActiveIdentity(rng));
    }

    for (const identity of cases) {
      wireFake(createFakeLocalIdentity());

      const saveResult = await saveLocalIdentity(identity);
      expect(saveResult).toEqual({ ok: true, value: undefined });

      const loadResult = await loadLocalIdentity();
      expect(loadResult).toEqual({ ok: true, value: identity });
    }
  });

  it('el registro persistido nunca contiene el Correo_Vinculado (Requisito 9.8)', async () => {
    const rng = createRng(DEFAULT_SEED);
    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const identity = genActiveIdentity(rng);
      const fake = createFakeLocalIdentity();
      wireFake(fake);

      await saveLocalIdentity(identity);

      const stored = fake.peek() as LocalIdentityRecord;
      expect(stored).not.toBeNull();
      expect(Object.keys(stored).sort()).toEqual(['nick', 'userIdentityId']);
      expect(stored).not.toHaveProperty('email');
    }
  });

  it('una lectura inmediatamente después de guardar refleja el valor nuevo, no uno anterior (sin lag)', async () => {
    const first: ActiveIdentity = { nick: 'primero', userIdentityId: 'id-1' };
    const second: ActiveIdentity = { nick: 'segundo', userIdentityId: 'id-2' };

    await saveLocalIdentity(first);
    expect(await loadLocalIdentity()).toEqual({ ok: true, value: first });

    await saveLocalIdentity(second);
    const afterSecond = await loadLocalIdentity();
    expect(afterSecond).toEqual({ ok: true, value: second });
    expect(afterSecond).not.toEqual({ ok: true, value: first });
  });

  it('tras clearLocalIdentity() una lectura posterior no devuelve la identidad anterior', async () => {
    const identity: ActiveIdentity = { nick: 'usuario', userIdentityId: 'id-cualquiera' };

    await saveLocalIdentity(identity);
    await clearLocalIdentity();

    expect(await loadLocalIdentity()).toEqual({ ok: true, value: null });
  });
});

// ─── Property 9 ─────────────────────────────────────────────────────────────

/**
 * Doble de un solo uso para el segundo bloque de Property 9: envuelve
 * `fakeLocalIdentity` (sin `failOn` en la construcción, ya que ese doble fija
 * el fallo en el momento de crearlo) con un interruptor que se puede activar
 * entre dos llamadas a `saveLocalIdentity` sobre el MISMO almacén subyacente.
 * Así se puede comprobar que un guardado fallido no toca lo que ya había, en
 * vez de comparar dos instancias independientes.
 */
function createToggleableFakeLocalIdentity(): FakeLocalIdentity & {
  setFailNextSave(fail: boolean): void;
} {
  const inner = createFakeLocalIdentity();
  let failNextSave = false;

  return {
    getLocalIdentityRecord: inner.getLocalIdentityRecord,
    async saveLocalIdentityRecord(record: LocalIdentityRecord): Promise<void> {
      if (failNextSave) {
        failNextSave = false;
        throw new Error("fakeLocalIdentity (toggle): fallo inyectado en 'save'");
      }
      return inner.saveLocalIdentityRecord(record);
    },
    clearLocalIdentityRecord: inner.clearLocalIdentityRecord,
    peek: inner.peek,
    setFailNextSave(fail: boolean): void {
      failNextSave = fail;
    },
  };
}

describe('Property 9: el fallo de escritura local no revoca el acceso', () => {
  it(`saveLocalIdentity() devuelve LOCAL_WRITE_FAILED sin lanzar cuando la escritura falla, en ${CASES_PER_PROPERTY} casos generados (semilla ${DEFAULT_SEED})`, async () => {
    const rng = createRng(DEFAULT_SEED);
    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const identity = genActiveIdentity(rng);
      wireFake(createFakeLocalIdentity({ failOn: new Set(['save']) }));

      const result = await saveLocalIdentity(identity);

      expect(result).toEqual({ ok: false, error: { kind: 'LOCAL_WRITE_FAILED' } });
    }
  });

  it(`un guardado fallido no corrompe ni sustituye parcialmente la identidad previamente guardada, en ${CASES_PER_PROPERTY} casos generados (semilla ${DEFAULT_SEED})`, async () => {
    const rng = createRng(DEFAULT_SEED);
    for (let i = 0; i < CASES_PER_PROPERTY; i++) {
      const previous = genActiveIdentity(rng);
      const attempted = genActiveIdentity(rng);
      const fake = createToggleableFakeLocalIdentity();
      wireFake(fake);

      const firstSave = await saveLocalIdentity(previous);
      expect(firstSave).toEqual({ ok: true, value: undefined });

      fake.setFailNextSave(true);
      const secondSave = await saveLocalIdentity(attempted);
      expect(secondSave).toEqual({ ok: false, error: { kind: 'LOCAL_WRITE_FAILED' } });

      // El almacén subyacente sigue conteniendo exactamente la identidad
      // anterior: ni se mezcla con `attempted` ni queda a medio escribir.
      expect(fake.peek()).toEqual({ nick: previous.nick, userIdentityId: previous.userIdentityId });

      const loadResult = await loadLocalIdentity();
      expect(loadResult).toEqual({ ok: true, value: previous });
    }
  });

  it('el fallo de escritura se resuelve como un IdentityResult, sin propagar una excepción', async () => {
    const identity = genActiveIdentity(createRng(DEFAULT_SEED));
    wireFake(createFakeLocalIdentity({ failOn: new Set(['save']) }));

    await expect(saveLocalIdentity(identity)).resolves.toEqual({
      ok: false,
      error: { kind: 'LOCAL_WRITE_FAILED' },
    });
  });
});
