// @vitest-environment jsdom
/**
 * Property 4: Como máximo un UserIdentity por Nick_Normalizado
 *
 * Para cualquier secuencia de altas (y de cambios de nick) que compitan por
 * el mismo `nickLower`, al terminar existe como máximo un registro
 * UserIdentity con ese valor, cada intento perdedor recibe `NICK_TAKEN`, y ni
 * el almacén remoto ni el Almacen_Local_Identidad cambian por causa de un
 * intento perdedor.
 *
 * `identityService.ts` llama a `saveLocalIdentity` (de `./identityLocal`)
 * directamente al conceder el acceso; aquí se sustituye por un doble para no
 * depender de IndexedDB real, siguiendo el mismo patrón de `vi.mock` que
 * `synchronizer.test.ts` usa para `./db`.
 *
 * Validates: Requirements 1.8, 5.6, 6.4
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ActiveIdentity, IdentityResult } from './identityErrors';
import { isValidEmail, isValidNick, normalizeEmail, normalizeNick, toNickLower } from './nickRules';
import {
  DEFAULT_SEED,
  CASES_PER_PROPERTY,
  createRng,
  randInt,
  genEmailCandidate,
  genNickCandidate,
  type Rng,
} from './__tests__/gen';
import { createFakeIdentityClient } from './__tests__/fakeIdentityClient';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const identityLocalMocks = vi.hoisted(() => ({
  saveLocalIdentity: vi.fn(),
}));

vi.mock('./identityLocal', () => identityLocalMocks);

import { createIdentityService, IDENTITY_TIMEOUT_MS } from './identityService';

beforeEach(() => {
  identityLocalMocks.saveLocalIdentity.mockReset();
  identityLocalMocks.saveLocalIdentity.mockResolvedValue({ ok: true, value: undefined });
  // Navegador online por defecto: el servicio solo lee `navigator.onLine`.
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => {
  // Vuelve siempre a temporizadores reales: algunos tests de la Propiedad 7
  // activan `vi.useFakeTimers()` y una fuga afectaría a los tests siguientes
  // de este fichero (p. ej. los `await` de las Propiedades 4 y 5).
  vi.useRealTimers();
});

// ─── Generadores locales de este fichero ───────────────────────────────────

/**
 * Nick de longitud válida compuesto solo por letras ASCII minúsculas. Se
 * restringe a letras (en vez de usar `genNickCandidate` filtrado) para que
 * cada carácter admita una variante en mayúscula o minúscula: dígitos, `_` y
 * `-` no tienen "casing" y diluirían el propósito de la propiedad.
 */
function genBaseNickLetters(rng: Rng): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const length = randInt(rng, 3, 16);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[randInt(rng, 0, chars.length - 1)];
  }
  return out;
}

/** Aplica una capitalización aleatoria carácter a carácter, sin cambiar el `nickLower`. */
function applyRandomCasing(rng: Rng, base: string): string {
  return base
    .split('')
    .map((ch) => (rng() < 0.5 ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');
}

/** Correo válido cuyo valor normalizado no está ya en `used`; lo añade al terminar. */
function genUniqueValidEmail(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = genEmailCandidate(rng);
    if (!isValidEmail(candidate)) continue;
    const normalized = normalizeEmail(candidate);
    if (used.has(normalized)) continue;
    used.add(normalized);
    return candidate;
  }
  // Fallback determinista si 200 intentos no dieron un correo único y válido
  // (no debería ocurrir con la semilla fija, evita un bucle infinito si cambiara).
  let counter = used.size;
  let fallback = `respaldo${counter}@ejemplo.com`;
  while (used.has(normalizeEmail(fallback))) {
    counter += 1;
    fallback = `respaldo${counter}@ejemplo.com`;
  }
  used.add(normalizeEmail(fallback));
  return fallback;
}

// ─── Property 4: unicidad de nick frente a intentos concurrentes de alta ───

describe('Property 4: como máximo un UserIdentity por Nick_Normalizado (altas concurrentes)', () => {
  it(`en ${CASES_PER_PROPERTY} escenarios generados (semilla ${DEFAULT_SEED}), exactamente una alta gana por cada nickLower y el resto recibe NICK_TAKEN`, async () => {
    const rng = createRng(DEFAULT_SEED);

    for (let scenario = 0; scenario < CASES_PER_PROPERTY; scenario++) {
      identityLocalMocks.saveLocalIdentity.mockClear();

      // Cliente en memoria nuevo por escenario: nunca se reutiliza estado
      // entre escenarios, pero sí se comparte entre todas las llamadas de
      // signUp DENTRO de un mismo escenario (la carrera real ocurre ahí).
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const baseNick = genBaseNickLetters(rng);
      const variantCount = randInt(rng, 2, 5);
      const usedEmails = new Set<string>();

      const results: IdentityResult<ActiveIdentity>[] = [];
      for (let v = 0; v < variantCount; v++) {
        const nickVariant = applyRandomCasing(rng, baseNick);
        const email = genUniqueValidEmail(rng, usedEmails);
        results.push(await service.signUp(nickVariant, email));
      }

      const successes = results.filter((r) => r.ok);
      const failures = results.filter((r) => !r.ok);

      // Como máximo (y, con correos únicos, exactamente) una alta gana.
      expect(successes.length).toBe(1);

      // Cada intento perdedor recibe NICK_TAKEN (nunca EMAIL_TAKEN: los
      // correos son todos distintos y únicos en este escenario).
      for (const failure of failures) {
        expect(failure.ok).toBe(false);
        if (!failure.ok) {
          expect(failure.error.kind).toBe('NICK_TAKEN');
        }
      }

      // El almacén remoto conserva exactamente un UserIdentity con ese
      // nickLower: sin registros parciales por los intentos perdedores.
      const nickLower = toNickLower(baseNick);
      const stored = await client.findByNickLower(nickLower);
      expect(stored).not.toBeNull();
      const createIdentityCalls = client.getTrace().filter((entry) => entry.op === 'createIdentity');
      expect(createIdentityCalls).toHaveLength(1);

      // El Almacen_Local_Identidad solo se escribe por el intento ganador:
      // ningún intento perdedor deja rastro en él.
      expect(identityLocalMocks.saveLocalIdentity).toHaveBeenCalledTimes(1);
    }
  });
});

// ─── Property 4 (cambio de nick): NICK_TAKEN no permite adoptar un nick ajeno ───

/** Semilla distinta de la usada arriba, para no confundir ambos fallos. */
const CHANGE_NICK_SEED = DEFAULT_SEED + 101;

describe('Property 4: como máximo un UserIdentity por Nick_Normalizado (cambio de nick, Requisito 5.6)', () => {
  it(`en ${CASES_PER_PROPERTY} escenarios generados (semilla ${CHANGE_NICK_SEED}), changeNick hacia el nick de otra identidad falla con NICK_TAKEN sin alterar ningún registro`, async () => {
    const rng = createRng(CHANGE_NICK_SEED);

    for (let scenario = 0; scenario < CASES_PER_PROPERTY; scenario++) {
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);
      const usedEmails = new Set<string>();

      // Dos identidades distintas ya creadas.
      const firstNick = genBaseNickLetters(rng);
      const firstEmail = genUniqueValidEmail(rng, usedEmails);
      const firstResult = await service.signUp(firstNick, firstEmail);
      expect(firstResult.ok).toBe(true);
      if (!firstResult.ok) continue; // TypeScript: descarta la rama de error.

      let secondNick = genBaseNickLetters(rng);
      while (toNickLower(secondNick) === toNickLower(firstNick)) {
        secondNick = genBaseNickLetters(rng);
      }
      const secondEmail = genUniqueValidEmail(rng, usedEmails);
      const secondResult = await service.signUp(secondNick, secondEmail);
      expect(secondResult.ok).toBe(true);
      if (!secondResult.ok) continue;

      // El segundo intenta adoptar (una variante de capitalización de) el
      // nick del primero.
      identityLocalMocks.saveLocalIdentity.mockClear();
      const collidingVariant = applyRandomCasing(rng, firstNick);
      const changeResult = await service.changeNick(secondResult.value, collidingVariant);

      expect(changeResult.ok).toBe(false);
      if (!changeResult.ok) {
        expect(changeResult.error.kind).toBe('NICK_TAKEN');
      }

      // Ningún registro cambia por el intento perdedor: ni el local...
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();

      // ...ni el remoto: el propietario original conserva su nick y su id,
      const ownerNow = await client.findByNickLower(toNickLower(firstNick));
      expect(ownerNow).not.toBeNull();
      expect(ownerNow?.userIdentityId).toBe(firstResult.value.userIdentityId);
      expect(ownerNow?.nick).toBe(firstResult.value.nick);

      // y el segundo (el que intentó el cambio) sigue con su propio nick.
      const secondNow = await client.findByNickLower(toNickLower(secondNick));
      expect(secondNow).not.toBeNull();
      expect(secondNow?.userIdentityId).toBe(secondResult.value.userIdentityId);
      expect(secondNow?.nick).toBe(secondResult.value.nick);
    }
  });
});

// ─── Property 5: Como máximo un UserIdentity por Correo_Vinculado ──────────
//
// Para cualquier secuencia de altas que compitan por el mismo correo
// normalizado (mismo valor tras `normalizeEmail`, con variantes de
// mayúsculas y de espacios en los extremos), como máximo una gana. El resto
// recibe `EMAIL_TAKEN` con el nick de la identidad que sí quedó creada
// (Requisito 3 criterio 2), siempre que cada intento use un nick distinto y
// disponible (para que el fallo sea atribuible al correo, no al nick).
//
// Validates: Requirements 1.9, 3.1, 3.2, 3.6, 6.5

/** Nick único (por `toNickLower`) que aún no está en `used`; lo añade al terminar. */
function genUniqueValidNick(rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = genBaseNickLetters(rng);
    const nickLower = toNickLower(candidate);
    if (used.has(nickLower)) continue;
    used.add(nickLower);
    return candidate;
  }
  // Fallback determinista si 200 intentos no dieron un nick único (no debería
  // ocurrir con la semilla fija), mismo patrón que `genUniqueValidEmail`.
  let counter = used.size;
  let fallback = `respaldo${counter}`;
  while (used.has(toNickLower(fallback))) {
    counter += 1;
    fallback = `respaldo${counter}`;
  }
  used.add(toNickLower(fallback));
  return fallback;
}

/** Correo válido cualquiera, sin restricción de unicidad (la propiedad varía uno solo por escenario). */
function genValidEmailBase(rng: Rng): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = genEmailCandidate(rng);
    if (isValidEmail(candidate)) return candidate;
  }
  // Fallback determinista, no debería alcanzarse con la semilla fija.
  return 'base@ejemplo.com';
}

/**
 * Variante de mayúsculas/espacios de un correo que normaliza al mismo valor:
 * `normalizeEmail` recorta extremos y pasa la cadena entera a minúsculas, así
 * que cualquier capitalización y cualquier espacio en los extremos son
 * indistinguibles para la unicidad del Correo_Vinculado.
 */
function applyEmailVariant(rng: Rng, base: string): string {
  const cased = applyRandomCasing(rng, base);
  const leading = ' '.repeat(randInt(rng, 0, 3));
  const trailing = ' '.repeat(randInt(rng, 0, 3));
  return `${leading}${cased}${trailing}`;
}

const EMAIL_UNIQUENESS_SEED = DEFAULT_SEED + 202;

describe('Property 5: como máximo un UserIdentity por Correo_Vinculado (altas concurrentes)', () => {
  it(`en ${CASES_PER_PROPERTY} escenarios generados (semilla ${EMAIL_UNIQUENESS_SEED}), exactamente una alta gana por cada correo normalizado y el resto recibe EMAIL_TAKEN con el nick del ganador`, async () => {
    const rng = createRng(EMAIL_UNIQUENESS_SEED);

    for (let scenario = 0; scenario < CASES_PER_PROPERTY; scenario++) {
      identityLocalMocks.saveLocalIdentity.mockClear();

      // Cliente en memoria nuevo por escenario, compartido por todas las
      // llamadas de signUp DENTRO de este escenario (ahí ocurre la carrera).
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const baseEmail = genValidEmailBase(rng);
      const variantCount = randInt(rng, 2, 5);
      const usedNicks = new Set<string>();

      const results: IdentityResult<ActiveIdentity>[] = [];
      for (let v = 0; v < variantCount; v++) {
        const emailVariant = applyEmailVariant(rng, baseEmail);
        const nick = genUniqueValidNick(rng, usedNicks);
        results.push(await service.signUp(nick, emailVariant));
      }

      const successIndex = results.findIndex((r) => r.ok);
      expect(successIndex).not.toBe(-1);

      const successes = results.filter((r) => r.ok);
      expect(successes.length).toBe(1);

      const winner = results[successIndex];
      if (!winner.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
      const winnerNick = winner.value.nick;

      // Cada intento perdedor recibe EMAIL_TAKEN con el nick de la identidad
      // que sí quedó creada (nunca NICK_TAKEN: los nicks son todos distintos
      // y disponibles en este escenario).
      for (let i = 0; i < results.length; i++) {
        if (i === successIndex) continue;
        const failure = results[i];
        expect(failure.ok).toBe(false);
        if (!failure.ok) {
          expect(failure.error.kind).toBe('EMAIL_TAKEN');
          if (failure.error.kind === 'EMAIL_TAKEN') {
            expect(failure.error.nick).toBe(winnerNick);
          }
        }
      }

      // Solo una llamada a createIdentity tuvo éxito en la traza del doble.
      const createIdentityCalls = client.getTrace().filter((entry) => entry.op === 'createIdentity');
      expect(createIdentityCalls).toHaveLength(1);

      // El Almacen_Local_Identidad solo se escribe por el intento ganador.
      expect(identityLocalMocks.saveLocalIdentity).toHaveBeenCalledTimes(1);
    }
  });
});

// ─── Property 5 (reclamo huérfano): reutilización de una EmailClaim sin UserIdentity ───
//
// Escenario del diagrama de secuencia «Flujo del alta» del diseño y del
// Requisito 3 criterio 6: un alta interrumpida puede dejar una `EmailClaim`
// reservada sin que llegue a crearse el `UserIdentity` correspondiente (el
// correo se reclamó, pero el nick estaba ocupado). Un alta posterior con ese
// mismo correo y un nick disponible debe reutilizar el `identityId` de esa
// claim huérfana, no fallar con EMAIL_TAKEN ni crear un id nuevo.

describe('Property 5 (reclamo huérfano): un alta posterior reutiliza la EmailClaim huérfana en vez de fallar', () => {
  it('el segundo alta con el mismo correo y un nick distinto y disponible tiene éxito y reutiliza el identityId de la EmailClaim huérfana', async () => {
    const client = createFakeIdentityClient();
    const service = createIdentityService(client);

    const rng = createRng(DEFAULT_SEED + 303);
    const takenNickLower = toNickLower(genBaseNickLetters(rng));

    // Simula que otra alta concurrente ya se quedó con este nickLower: se llama
    // directamente sobre el doble, sin pasar por el servicio. Hacen falta las
    // dos piezas —la claim y el UserIdentity que la lleva—, porque la autoridad
    // sobre «este nick está ocupado» es el índice de UserIdentity: una claim sin
    // identidad es una claim huérfana y el nick se considera libre.
    const preseed = await client.createNickClaim(takenNickLower, 'someone-else-id');
    expect(preseed.ok).toBe(true);
    await client.createIdentity({
      id: 'someone-else-id',
      nick: takenNickLower,
      nickLower: takenNickLower,
      email: 'ocupante@ejemplo.com',
    });

    const email = genValidEmailBase(rng);

    // Primer intento: la EmailClaim se reclama con éxito, pero la NickClaim
    // falla (ya ocupada), dejando la EmailClaim huérfana: ningún
    // UserIdentity llega a crearse.
    const firstResult = await service.signUp(takenNickLower, email);
    expect(firstResult.ok).toBe(false);
    if (firstResult.ok) return; // TypeScript: descarta la rama de éxito (ya comprobado arriba).
    expect(firstResult.error.kind).toBe('NICK_TAKEN');

    const firstEmailClaimCall = client.getTrace().find((entry) => entry.op === 'createEmailClaim');
    expect(firstEmailClaimCall).toBeDefined();
    const orphanedIdentityId = firstEmailClaimCall?.args[1] as string;

    // Ningún UserIdentity fue creado por el intento fallido.
    expect(await client.findByEmail(normalizeEmail(email))).toBeNull();

    // Segundo intento: mismo correo (con variante de mayúsculas/espacios),
    // nick distinto y disponible.
    let secondNick = genBaseNickLetters(rng);
    while (toNickLower(secondNick) === takenNickLower) {
      secondNick = genBaseNickLetters(rng);
    }
    const emailVariant = applyEmailVariant(rng, email);
    const secondResult = await service.signUp(secondNick, emailVariant);

    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return; // TypeScript: descarta la rama de error (ya comprobado arriba).

    // El id reutilizado es el mismo que se usó al reclamar el correo la
    // primera vez: la EmailClaim huérfana se reaprovecha, no se duplica.
    expect(secondResult.value.userIdentityId).toBe(orphanedIdentityId);

    // La primera entrada `createIdentity` de la traza es el ocupante que se
    // sembró a mano arriba; la del servicio es la última.
    const createIdentityCalls = client.getTrace().filter((entry) => entry.op === 'createIdentity');
    const createIdentityCall = createIdentityCalls[createIdentityCalls.length - 1];
    expect(createIdentityCall).toBeDefined();
    const createdInput = createIdentityCall?.args[0] as { id: string };
    expect(createdInput.id).toBe(orphanedIdentityId);
  });
});

// ─── Property 7: Ningún fallo de identidad deja rastro ────────────────────
//
// Para cualquier modo de fallo (nick ocupado, correo ocupado, nick
// inexistente, error de backend, respuesta que no llega antes del plazo,
// `navigator.onLine` en `false` o nick/correo sintácticamente inválido), el
// Almacen_Local_Identidad queda byte a byte como estaba (nunca se llama a
// `saveLocalIdentity`), el registro UserIdentity afectado queda sin cambios y
// ninguna operación posterior a la que falla llega a emitirse.
//
// El fallo de escritura LOCAL (Requisito 4.8, Propiedad 9) es la única
// excepción deliberada: ahí el acceso remoto sí se concede, así que se cubre
// en `identityLocal.test.ts` (tarea 5.4), no aquí.
//
// Validates: Requirements 1.10, 2.4, 2.8, 4.7, 5.7, 8.7, 12.3, 12.6

/** Número de casos por bucle tipo propiedad de esta sección (modos de fallo discretos, no un espacio continuo). */
const FAILURE_PROPERTY_CASES = 80;

/** Nick sintácticamente inválido (vacío, demasiado largo o con carácter fuera del alfabeto del Requisito 1 criterio 2). */
function genInvalidNickCandidate(rng: Rng): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = genNickCandidate(rng);
    if (!isValidNick(candidate)) return candidate;
  }
  return ''; // Vacío es siempre inválido (longitud mínima 3); no debería alcanzarse con la semilla fija.
}

/** Correo sintácticamente inválido (sin arroba, sin punto en el dominio o de longitud fuera de 6-254). */
function genInvalidEmailCandidate(rng: Rng): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = genEmailCandidate(rng);
    if (!isValidEmail(candidate)) return candidate;
  }
  return 'sin-arroba'; // Siempre inválido; no debería alcanzarse con la semilla fija.
}

describe('Property 7: ningún fallo de identidad deja rastro', () => {
  describe('TIMEOUT (temporizadores falsos de Vitest, plazo de 10 s de IDENTITY_TIMEOUT_MS)', () => {
    it('signUp con createEmailClaim colgado resuelve TIMEOUT sin guardar localmente ni crear ninguna claim/identidad posterior', async () => {
      vi.useFakeTimers();
      const client = createFakeIdentityClient({ hangOn: new Set(['createEmailClaim']) });
      const service = createIdentityService(client);

      const pending = service.signUp('nickvalido', 'correo@ejemplo.com');
      await vi.advanceTimersByTimeAsync(IDENTITY_TIMEOUT_MS);
      const result = await pending;

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('TIMEOUT');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      const downstream = client
        .getTrace()
        .filter((entry) => entry.op === 'createNickClaim' || entry.op === 'createIdentity');
      expect(downstream).toHaveLength(0);
    });

    it('signIn con findByNickLower colgado resuelve TIMEOUT sin guardar localmente', async () => {
      vi.useFakeTimers();
      const client = createFakeIdentityClient({ hangOn: new Set(['findByNickLower']) });
      const service = createIdentityService(client);

      const pending = service.signIn('nickvalido');
      await vi.advanceTimersByTimeAsync(IDENTITY_TIMEOUT_MS);
      const result = await pending;

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('TIMEOUT');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
    });

    it('changeNick con findByNickLower colgado resuelve TIMEOUT sin guardar localmente ni actualizar el registro', async () => {
      vi.useFakeTimers();
      const client = createFakeIdentityClient({ hangOn: new Set(['findByNickLower']) });
      const service = createIdentityService(client);

      // El alta previa no llama a `findByNickLower` (signUp no la usa), así
      // que se completa con normalidad incluso con esa operación colgada.
      const signUpResult = await service.signUp('propietario', 'propietario@ejemplo.com');
      expect(signUpResult.ok).toBe(true);
      if (!signUpResult.ok) return;
      identityLocalMocks.saveLocalIdentity.mockClear();

      // `changeNick` reclama la claim primero y solo consulta `findByNickLower`
      // si la clave está ocupada, así que hay que ocuparla para llegar a la
      // operación colgada.
      const preseed = await client.createNickClaim('otronick', 'otra-identidad');
      expect(preseed.ok).toBe(true);

      const pending = service.changeNick(signUpResult.value, 'otronick');
      await vi.advanceTimersByTimeAsync(IDENTITY_TIMEOUT_MS);
      const result = await pending;

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('TIMEOUT');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      const updateNickCalls = client.getTrace().filter((entry) => entry.op === 'updateNick');
      expect(updateNickCalls).toHaveLength(0);
    });
  });

  describe('BACKEND (fallo de una claim o de la escritura, vía failOn)', () => {
    it('signUp con createEmailClaim fallido devuelve BACKEND sin crear ninguna claim ni identidad', async () => {
      const client = createFakeIdentityClient({ failOn: new Set(['createEmailClaim']) });
      const service = createIdentityService(client);

      const result = await service.signUp('nickvalido', 'correo@ejemplo.com');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('BACKEND');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace().some((entry) => entry.op === 'createIdentity')).toBe(false);
      expect(await client.findByEmail('correo@ejemplo.com')).toBeNull();
    });

    it('signUp con createNickClaim fallido devuelve BACKEND sin crear ninguna identidad', async () => {
      const client = createFakeIdentityClient({ failOn: new Set(['createNickClaim']) });
      const service = createIdentityService(client);

      const result = await service.signUp('nickvalido', 'correo@ejemplo.com');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('BACKEND');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace().some((entry) => entry.op === 'createIdentity')).toBe(false);
    });

    it('signUp con createIdentity fallido devuelve BACKEND sin dejar ninguna identidad creada', async () => {
      const client = createFakeIdentityClient({ failOn: new Set(['createIdentity']) });
      const service = createIdentityService(client);

      const result = await service.signUp('nickvalido', 'correo@ejemplo.com');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('BACKEND');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(await client.findByNickLower('nickvalido')).toBeNull();
    });

    it('changeNick con createNickClaim fallido devuelve BACKEND sin modificar el registro', async () => {
      // El alta previa también llama a `createNickClaim`: falla solo a
      // partir de la segunda llamada, para que el alta inicial tenga éxito y
      // sea el `changeNick` posterior el que encuentre el fallo.
      let nickClaimCalls = 0;
      const client = createFakeIdentityClient({
        failOn: (op: string) => op === 'createNickClaim' && ++nickClaimCalls > 1,
      });
      const service = createIdentityService(client);

      const signUpResult = await service.signUp('propietario', 'propietario@ejemplo.com');
      expect(signUpResult.ok).toBe(true);
      if (!signUpResult.ok) return;
      identityLocalMocks.saveLocalIdentity.mockClear();

      const result = await service.changeNick(signUpResult.value, 'otronick');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('BACKEND');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      const stillOwner = await client.findByNickLower('propietario');
      expect(stillOwner?.userIdentityId).toBe(signUpResult.value.userIdentityId);
      expect(stillOwner?.nick).toBe(signUpResult.value.nick);
    });

    it('changeNick con updateNick fallido (solo capitalización) devuelve BACKEND sin modificar el registro', async () => {
      const client = createFakeIdentityClient({ failOn: new Set(['updateNick']) });
      const service = createIdentityService(client);

      const signUpResult = await service.signUp('propietario', 'propietario@ejemplo.com');
      expect(signUpResult.ok).toBe(true);
      if (!signUpResult.ok) return;
      identityLocalMocks.saveLocalIdentity.mockClear();

      // Solo cambia la capitalización: se salta la claim (Req 5.2) y va
      // directo a `updateNick`, que aquí falla.
      const result = await service.changeNick(signUpResult.value, 'PROPIETARIO');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('BACKEND');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      const stillOwner = await client.findByNickLower('propietario');
      expect(stillOwner?.nick).toBe('propietario');
    });
  });

  describe('OFFLINE (navigator.onLine en false, antes de cualquier llamada al cliente)', () => {
    it('signUp offline devuelve OFFLINE sin emitir ninguna operación', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const result = await service.signUp('nickvalido', 'correo@ejemplo.com');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('OFFLINE');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace()).toHaveLength(0);
    });

    it('signIn offline devuelve OFFLINE sin emitir ninguna operación', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const result = await service.signIn('nickvalido');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('OFFLINE');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace()).toHaveLength(0);
    });

    it('changeNick offline devuelve OFFLINE sin emitir ninguna operación', async () => {
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);
      const signUpResult = await service.signUp('propietario', 'propietario@ejemplo.com');
      expect(signUpResult.ok).toBe(true);
      if (!signUpResult.ok) return;

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      identityLocalMocks.saveLocalIdentity.mockClear();
      const traceBeforeOffline = client.getTrace().length;

      const result = await service.changeNick(signUpResult.value, 'otronick');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('OFFLINE');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace()).toHaveLength(traceBeforeOffline);
    });
  });

  describe('NICK_INVALID / EMAIL_INVALID (validación pura, antes de cualquier llamada al cliente)', () => {
    it('signUp con nick inválido devuelve NICK_INVALID sin emitir ninguna operación', async () => {
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const result = await service.signUp('a', 'correo@ejemplo.com');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NICK_INVALID');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace()).toHaveLength(0);
    });

    it('signUp con correo inválido devuelve EMAIL_INVALID sin emitir ninguna operación', async () => {
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const result = await service.signUp('nickvalido', 'sin-arroba');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('EMAIL_INVALID');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace()).toHaveLength(0);
    });

    it('signIn con nick inválido devuelve NICK_INVALID sin emitir ninguna operación', async () => {
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const result = await service.signIn('a');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NICK_INVALID');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace()).toHaveLength(0);
    });

    it('changeNick con nick inválido devuelve NICK_INVALID sin emitir ninguna operación', async () => {
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);
      const current: ActiveIdentity = { nick: 'propietario', userIdentityId: 'id-1' };

      const result = await service.changeNick(current, 'a');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NICK_INVALID');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
      expect(client.getTrace()).toHaveLength(0);
    });
  });

  describe('NICK_NOT_FOUND', () => {
    it('signIn con un nick que no existe en un cliente vacío devuelve NICK_NOT_FOUND sin guardar localmente', async () => {
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const result = await service.signIn('inexistente');

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NICK_NOT_FOUND');
      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
    });
  });

  // ─── Recorrido tipo propiedad: mismo modo de fallo, muchas variantes ────
  //
  // Los modos de fallo son discretos, no un espacio continuo; en vez de una
  // única propiedad sobre todos los modos a la vez, cada bucle fija el modo
  // de fallo y varía el nick/correo/id de entrada para comprobar que la
  // ausencia de rastro se mantiene en todos los casos generados.

  describe(`variantes generadas (${FAILURE_PROPERTY_CASES} casos por bucle, semillas propias)`, () => {
    it('cualquier nick sintácticamente inválido produce NICK_INVALID sin emitir ninguna operación, en signUp, signIn y changeNick', async () => {
      const rng = createRng(DEFAULT_SEED + 707);
      const current: ActiveIdentity = { nick: 'propietario', userIdentityId: 'id-1' };

      for (let i = 0; i < FAILURE_PROPERTY_CASES; i++) {
        const invalidNick = genInvalidNickCandidate(rng);

        const clientSignUp = createFakeIdentityClient();
        const signUpResult = await createIdentityService(clientSignUp).signUp(invalidNick, 'correo@ejemplo.com');
        expect(signUpResult.ok).toBe(false);
        if (!signUpResult.ok) expect(signUpResult.error.kind).toBe('NICK_INVALID');
        expect(clientSignUp.getTrace()).toHaveLength(0);

        const clientSignIn = createFakeIdentityClient();
        const signInResult = await createIdentityService(clientSignIn).signIn(invalidNick);
        expect(signInResult.ok).toBe(false);
        if (!signInResult.ok) expect(signInResult.error.kind).toBe('NICK_INVALID');
        expect(clientSignIn.getTrace()).toHaveLength(0);

        const clientChange = createFakeIdentityClient();
        const changeResult = await createIdentityService(clientChange).changeNick(current, invalidNick);
        expect(changeResult.ok).toBe(false);
        if (!changeResult.ok) expect(changeResult.error.kind).toBe('NICK_INVALID');
        expect(clientChange.getTrace()).toHaveLength(0);
      }

      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
    });

    it('cualquier correo sintácticamente inválido produce EMAIL_INVALID en signUp sin emitir ninguna operación', async () => {
      const rng = createRng(DEFAULT_SEED + 808);

      for (let i = 0; i < FAILURE_PROPERTY_CASES; i++) {
        const invalidEmail = genInvalidEmailCandidate(rng);

        const client = createFakeIdentityClient();
        const result = await createIdentityService(client).signUp('nickvalido', invalidEmail);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('EMAIL_INVALID');
        expect(client.getTrace()).toHaveLength(0);
      }

      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
    });

    it('cualquier nick y correo válidos con navigator.onLine en false producen OFFLINE sin emitir ninguna operación', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      const rng = createRng(DEFAULT_SEED + 909);
      const usedNicks = new Set<string>();

      for (let i = 0; i < FAILURE_PROPERTY_CASES; i++) {
        const nick = genUniqueValidNick(rng, usedNicks);
        const email = genValidEmailBase(rng);

        const client = createFakeIdentityClient();
        const result = await createIdentityService(client).signUp(nick, email);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('OFFLINE');
        expect(client.getTrace()).toHaveLength(0);
      }

      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
    });

    it('cualquier alta con createEmailClaim fallido produce BACKEND sin dejar ninguna identidad creada, para muchos nicks y correos válidos distintos', async () => {
      const rng = createRng(DEFAULT_SEED + 1010);
      const usedNicks = new Set<string>();

      for (let i = 0; i < FAILURE_PROPERTY_CASES; i++) {
        const nick = genUniqueValidNick(rng, usedNicks);
        const email = genValidEmailBase(rng);

        const client = createFakeIdentityClient({ failOn: new Set(['createEmailClaim']) });
        const result = await createIdentityService(client).signUp(nick, email);

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.kind).toBe('BACKEND');
        expect(client.getTrace().some((entry) => entry.op === 'createIdentity')).toBe(false);
      }

      expect(identityLocalMocks.saveLocalIdentity).not.toHaveBeenCalled();
    });
  });
});

// ─── Property 8: Entrar, salir y volver a entrar es un round trip de identidad ───
//
// Para cualquier identidad creada con `signUp`, entrar con `signIn` usando el
// mismo Nick (en cualquier variante de capitalización, porque `signIn`
// compara por `nickLower`) devuelve exactamente la misma `ActiveIdentity` (el
// mismo `nick` tal como quedó almacenado, el mismo `userIdentityId`) que la
// del alta original. Esto modela el ciclo "salir y volver a entrar" a nivel
// de servicio: el borrado/recarga real del almacén local lo hace `switchUser`
// en el store (tarea 9.2, ya implementada); esta propiedad comprueba la
// garantía subyacente que hace posible ese ciclo: la búsqueda por Nick en el
// servidor siempre devuelve la misma identidad que se creó.
//
// Se extiende con el control «Entrar con ese nick» del Requisito 3 criterio
// 4: tras un EMAIL_TAKEN tratando de dar de alta un segundo nick con el mismo
// correo, el `nick` del error también hace `signIn` con éxito y devuelve la
// identidad ORIGINAL (no una nueva).
//
// Validates: Requirements 2.3, 2.5, 3.4, 4.4, 4.5

const ROUND_TRIP_SEED = DEFAULT_SEED + 404;

describe('Property 8: entrar, salir y volver a entrar es un round trip de identidad', () => {
  it(`en ${CASES_PER_PROPERTY} escenarios generados (semilla ${ROUND_TRIP_SEED}), signIn con cualquier variante de capitalización del mismo nick devuelve siempre la identidad del alta original`, async () => {
    const rng = createRng(ROUND_TRIP_SEED);

    for (let scenario = 0; scenario < CASES_PER_PROPERTY; scenario++) {
      identityLocalMocks.saveLocalIdentity.mockClear();

      // Mismo cliente en memoria para todo el escenario: simula que el
      // registro UserIdentity en el servidor no cambia entre ciclos de
      // "salir y volver a entrar".
      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const baseNick = genBaseNickLetters(rng);
      const nickVariantForSignUp = applyRandomCasing(rng, baseNick);
      const email = genValidEmailBase(rng);

      const signUpResult = await service.signUp(nickVariantForSignUp, email);
      expect(signUpResult.ok).toBe(true);
      if (!signUpResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
      const original = signUpResult.value;

      expect(identityLocalMocks.saveLocalIdentity).toHaveBeenLastCalledWith(original);

      // Varios ciclos de "salir y volver a entrar" en el mismo escenario: la
      // búsqueda por nick es idempotente, cada ciclo devuelve exactamente la
      // misma identidad, con independencia de la capitalización usada.
      const cycleCount = randInt(rng, 2, 4);
      for (let cycle = 0; cycle < cycleCount; cycle++) {
        identityLocalMocks.saveLocalIdentity.mockClear();
        const signInVariant = applyRandomCasing(rng, baseNick);

        const signInResult = await service.signIn(signInVariant);

        expect(signInResult.ok).toBe(true);
        if (!signInResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).

        // Req 2.3: el nick adoptado es el ALMACENADO en el alta original, no
        // la variante de capitalización escrita en este signIn.
        expect(signInResult.value).toEqual(original);
        expect(signInResult.value.nick).toBe(original.nick);
        expect(signInResult.value.userIdentityId).toBe(original.userIdentityId);

        expect(identityLocalMocks.saveLocalIdentity).toHaveBeenLastCalledWith(original);
      }

      // El registro remoto sigue siendo el mismo tras todos los ciclos: la
      // búsqueda por nickLower no lo ha alterado (Req 4.5).
      const stillStored = await client.findByNickLower(toNickLower(baseNick));
      expect(stillStored).toEqual(original);

      // Extensión (Req 3.4): tras un EMAIL_TAKEN al intentar dar de alta un
      // segundo nick con el mismo correo, "Entrar con ese nick" usando el
      // nick devuelto en el error también recupera la identidad ORIGINAL.
      identityLocalMocks.saveLocalIdentity.mockClear();
      let secondNick = genBaseNickLetters(rng);
      while (toNickLower(secondNick) === toNickLower(baseNick)) {
        secondNick = genBaseNickLetters(rng);
      }
      const emailVariant = applyEmailVariant(rng, email);
      const secondSignUpResult = await service.signUp(secondNick, emailVariant);

      expect(secondSignUpResult.ok).toBe(false);
      if (secondSignUpResult.ok) continue; // TypeScript: descarta la rama de éxito (no debería alcanzarse).
      expect(secondSignUpResult.error.kind).toBe('EMAIL_TAKEN');
      if (secondSignUpResult.error.kind !== 'EMAIL_TAKEN') continue;
      expect(secondSignUpResult.error.nick).toBe(original.nick);

      identityLocalMocks.saveLocalIdentity.mockClear();
      const chainedSignInResult = await service.signIn(secondSignUpResult.error.nick);

      expect(chainedSignInResult.ok).toBe(true);
      if (!chainedSignInResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
      expect(chainedSignInResult.value).toEqual(original);
      expect(identityLocalMocks.saveLocalIdentity).toHaveBeenLastCalledWith(original);
    }
  });
});

// ─── Property 10: El cambio de nick preserva identificador, correo y progreso ───
//
// Para cualquier `changeNick(current, newNick)` con éxito:
// 1. El `userIdentityId` del resultado es IDÉNTICO al de `current` (Req 5.2:
//    "conservando su identificador").
// 2. El correo vinculado en el servidor no cambia (Req 5.2: "sin volver a
//    solicitar el Correo_Vinculado"): se comprueba que `findByEmail` con el
//    correo original sigue resolviendo al MISMO `userIdentityId` después del
//    cambio de nick, es decir, la claim de correo sigue apuntando a la misma
//    identidad y el correo no se ha reasignado ni alterado.
// 3. "Progreso" (Req 5.4: GameState, calibración y TeamCode del perfil local)
//    y el Req 12.7 (GameState y los minutos ya guardados en IndexedDB_Local)
//    son garantías que se cumplen POR CONSTRUCCIÓN a este nivel: el cuerpo de
//    `changeNick` (ver `identityService.ts`) no importa ni referencia en
//    ningún punto `GameState`, `calibration` ni `teamCode` — solo opera sobre
//    `UserIdentity`/`NickClaim` a través de `IdentityDataClient` y sobre el
//    Almacen_Local_Identidad a través de `saveLocalIdentity`. No hay ninguna
//    ruta de código en este módulo que pueda tocar esos datos, así que no
//    existe un escenario fabricable en `identityService.test.ts` que ejercite
//    esa preservación: sería una aserción sobre datos que el módulo bajo test
//    nunca ve. La garantía equivalente a nivel de store (que la acción
//    `changeNick` de `useAppStore.ts` no toca `game`/`calibration`/`teamCode`)
//    ya quedó cubierta en la tarea 9.2 y es responsabilidad de ese módulo, no
//    de este. Aquí se prueba lo que SÍ es observable desde el servicio:
//    identificador y correo.
//
// Validates: Requirements 5.2, 5.4, 12.7

const CHANGE_NICK_PRESERVES_SEED = DEFAULT_SEED + 505;

describe('Property 10: el cambio de nick preserva identificador y correo', () => {
  it(`en ${CASES_PER_PROPERTY} escenarios generados (semilla ${CHANGE_NICK_PRESERVES_SEED}), changeNick a un nick distinto y disponible conserva userIdentityId y el correo vinculado`, async () => {
    const rng = createRng(CHANGE_NICK_PRESERVES_SEED);

    for (let scenario = 0; scenario < CASES_PER_PROPERTY; scenario++) {
      identityLocalMocks.saveLocalIdentity.mockClear();

      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const originalNick = genBaseNickLetters(rng);
      const email = genValidEmailBase(rng);

      const signUpResult = await service.signUp(originalNick, email);
      expect(signUpResult.ok).toBe(true);
      if (!signUpResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
      const original = signUpResult.value;

      // Nick nuevo con un nickLower distinto del original (rama que sí pasa
      // por la claim, Req 5.6).
      let newNick = genBaseNickLetters(rng);
      while (toNickLower(newNick) === toNickLower(originalNick)) {
        newNick = genBaseNickLetters(rng);
      }

      identityLocalMocks.saveLocalIdentity.mockClear();
      const changeResult = await service.changeNick(original, newNick);

      expect(changeResult.ok).toBe(true);
      if (!changeResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
      const changed = changeResult.value;

      // 1. Mismo identificador que antes del cambio.
      expect(changed.userIdentityId).toBe(original.userIdentityId);

      // El nick del resultado es el nuevo, recortado pero no minusculizado
      // (normalizeNick no cambia la capitalización).
      expect(changed.nick).toBe(normalizeNick(newNick));

      // 2. El correo vinculado en el servidor sigue apuntando a la MISMA
      // identidad: la claim de correo no se ha tocado ni reasignado por el
      // cambio de nick (identityService.ts nunca llama a ninguna operación
      // de correo dentro de changeNick).
      const byEmailAfter = await client.findByEmail(normalizeEmail(email));
      expect(byEmailAfter).not.toBeNull();
      expect(byEmailAfter?.userIdentityId).toBe(original.userIdentityId);

      // El Almacen_Local_Identidad se actualiza con la identidad NUEVA.
      expect(identityLocalMocks.saveLocalIdentity).toHaveBeenLastCalledWith(changed);

      // ─── Rama "solo cambia la capitalización" (Req 5.2) ─────────────────
      // Misma nickLower que el nick actual: se salta la claim y va directo a
      // updateNick. Se comprueba tanto la preservación de identificador y
      // correo como que no se emite ninguna createNickClaim nueva.
      identityLocalMocks.saveLocalIdentity.mockClear();
      const traceLengthBeforeCasingChange = client.getTrace().length;
      const casingVariant = applyRandomCasing(rng, changed.nick);

      const casingChangeResult = await service.changeNick(changed, casingVariant);

      expect(casingChangeResult.ok).toBe(true);
      if (!casingChangeResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
      const casingChanged = casingChangeResult.value;

      expect(casingChanged.userIdentityId).toBe(original.userIdentityId);
      expect(casingChanged.nick).toBe(normalizeNick(casingVariant));

      const byEmailAfterCasing = await client.findByEmail(normalizeEmail(email));
      expect(byEmailAfterCasing).not.toBeNull();
      expect(byEmailAfterCasing?.userIdentityId).toBe(original.userIdentityId);

      // Ninguna createNickClaim nueva desde este punto: la rama de solo
      // capitalización se la salta (Req 5.2).
      const newTraceEntries = client.getTrace().slice(traceLengthBeforeCasingChange);
      expect(newTraceEntries.some((entry) => entry.op === 'createNickClaim')).toBe(false);

      expect(identityLocalMocks.saveLocalIdentity).toHaveBeenLastCalledWith(casingChanged);
    }
  });
});

// ─── Property 14: Superficie de datos salientes ────────────────────────────
//
// Sobre la traza COMPLETA de operaciones que el Sistema_Identidad emite a
// través de `IdentityDataClient` en una secuencia mixta de `signUp`,
// `signIn` y `changeNick`, el Correo_Vinculado solo puede aparecer como
// argumento en las operaciones del alta (`createEmailClaim`, `getEmailClaim`,
// `findByEmail` y `createIdentity`, cuyo `UserIdentityInput` incluye
// `email`). Nunca debe aparecer en `createNickClaim`, `getNickClaim`,
// `findByNickLower` ni `updateNick`: son las operaciones que usan `signIn` y
// `changeNick`, que el Requisito 9 criterio 1 exige que nunca transmitan el
// correo.
//
// Validates: Requirements 9.1, 9.2, 9.3, 9.7, 9.10

const OUTGOING_DATA_SEED = DEFAULT_SEED + 606;

describe('Property 14: superficie de datos salientes — el correo solo aparece en las operaciones del alta', () => {
  it(`en ${CASES_PER_PROPERTY} escenarios generados (semilla ${OUTGOING_DATA_SEED}), el correo nunca aparece en createNickClaim/getNickClaim/findByNickLower/updateNick tras una secuencia mixta de signUp/signIn/changeNick`, async () => {
    const rng = createRng(OUTGOING_DATA_SEED);

    // Operaciones que sí pueden (y deben) transportar el correo: son
    // exclusivas del alta.
    const SIGNUP_ONLY_OPS = new Set(['createEmailClaim', 'getEmailClaim', 'findByEmail', 'createIdentity']);
    // Operaciones que nunca deben transportar el correo: las usa signIn (Req
    // 2) y changeNick (Req 5), que el Requisito 9 criterio 1 exige que nunca
    // transmitan el Correo_Vinculado.
    const NON_EMAIL_OPS = new Set(['createNickClaim', 'getNickClaim', 'findByNickLower', 'updateNick']);

    for (let scenario = 0; scenario < CASES_PER_PROPERTY; scenario++) {
      identityLocalMocks.saveLocalIdentity.mockClear();

      const client = createFakeIdentityClient();
      const service = createIdentityService(client);

      const nick = genBaseNickLetters(rng);
      const email = genValidEmailBase(rng);

      const signUpResult = await service.signUp(nick, email);
      expect(signUpResult.ok).toBe(true);
      if (!signUpResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).

      // Unos cuantos ciclos más de acceso y cambio de nick sobre la misma
      // identidad, mezclando variantes de capitalización, para acumular
      // operaciones de las dos familias en la MISMA traza.
      let current = signUpResult.value;
      const cycles = randInt(rng, 1, 3);
      for (let cycle = 0; cycle < cycles; cycle++) {
        const signInVariant = applyRandomCasing(rng, current.nick);
        const signInResult = await service.signIn(signInVariant);
        expect(signInResult.ok).toBe(true);
        if (!signInResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
        current = signInResult.value;

        let newNick = genBaseNickLetters(rng);
        while (toNickLower(newNick) === toNickLower(current.nick)) {
          newNick = genBaseNickLetters(rng);
        }
        const changeResult = await service.changeNick(current, newNick);
        expect(changeResult.ok).toBe(true);
        if (!changeResult.ok) continue; // TypeScript: descarta la rama de error (ya comprobado arriba).
        current = changeResult.value;
      }

      // La comprobación se hace sobre la traza ACUMULADA completa del
      // escenario, no reiniciada entre llamadas: la propiedad exige que se
      // cumpla sobre todo el historial de operaciones, no solo por llamada.
      const trace = client.getTrace();
      const emailLower = email.toLowerCase();

      for (const entry of trace) {
        if (!NON_EMAIL_OPS.has(entry.op)) continue;
        const serialized = JSON.stringify(entry.args);
        expect(serialized.includes(email)).toBe(false);
        expect(serialized.toLowerCase().includes(emailLower)).toBe(false);
      }

      // Confirmación de cordura del propio test: el correo SÍ aparece en al
      // menos una de las operaciones legítimas del alta, para descartar que
      // el escenario generado nunca haya llegado a usar el correo.
      const signUpOpsWithEmail = trace.filter(
        (entry) => SIGNUP_ONLY_OPS.has(entry.op) && JSON.stringify(entry.args).toLowerCase().includes(emailLower),
      );
      expect(signUpOpsWithEmail.length).toBeGreaterThan(0);
    }
  });
});

// ─── Claim de nick huérfana (nick abandonado por un cambio de nick) ─────────

describe('claim de nick huérfana: un nick abandonado vuelve a estar disponible', () => {
  /**
   * Reproduce el estado real observado en el sandbox: `UserIdentity` con el nick
   * «vicmaf» y dos `NickClaim`, «vicma» y «vicmaf». La claim de «vicma» quedó
   * huérfana al cambiar de nick, y dejaba ese nick inservible para todos.
   */
  async function conNickAbandonado() {
    const client = createFakeIdentityClient();
    const service = createIdentityService(client);

    const alta = await service.signUp('vicma', 'vic@example.com');
    if (!alta.ok) throw new Error('el alta de partida debería funcionar');

    const cambio = await service.changeNick(alta.value, 'vicmaf');
    if (!cambio.ok) throw new Error('el cambio de nick debería funcionar');

    return { client, service, identidad: cambio.value };
  }

  it('el nick abandonado ya no pertenece a ninguna identidad', async () => {
    const { client } = await conNickAbandonado();

    expect(await client.findByNickLower('vicma')).toBeNull();
    // …pero su claim sigue ahí: es lo que causaba el limbo.
    expect(await client.getNickClaim('vicma')).not.toBeNull();
  });

  it('otra persona puede dar de alta el nick abandonado', async () => {
    const { service } = await conNickAbandonado();

    const otra = await service.signUp('vicma', 'otra@example.com');

    expect(otra.ok).toBe(true);
    if (otra.ok) expect(otra.value.nick).toBe('vicma');
  });

  it('su dueño original puede recuperarlo con un cambio de nick', async () => {
    const { service, identidad } = await conNickAbandonado();

    const vuelta = await service.changeNick(identidad, 'vicma');

    expect(vuelta.ok).toBe(true);
    if (vuelta.ok) {
      expect(vuelta.value.nick).toBe('vicma');
      // Mismo registro: el id no cambia nunca (Req 5.2).
      expect(vuelta.value.userIdentityId).toBe(identidad.userIdentityId);
    }
  });

  it('un nick que sí lleva una identidad sigue rechazándose', async () => {
    const { service } = await conNickAbandonado();

    // «vicmaf» es el nick vivo de la identidad existente.
    const alta = await service.signUp('vicmaf', 'tercera@example.com');

    expect(alta.ok).toBe(false);
    if (!alta.ok) expect(alta.error.kind).toBe('NICK_TAKEN');
  });

  it('tras recuperarlo, «Ya tengo nick» concede el acceso con ese nick', async () => {
    const { service, identidad } = await conNickAbandonado();
    await service.changeNick(identidad, 'vicma');

    const entrada = await service.signIn('vicma');

    expect(entrada.ok).toBe(true);
    if (entrada.ok) expect(entrada.value.nick).toBe('vicma');
  });
});
