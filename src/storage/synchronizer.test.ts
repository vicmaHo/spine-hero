// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProfileRecord, MinuteEntry } from './db';
import type { ActiveIdentity } from './identityErrors';
import { todayLocalDate } from './dateKey';
import { createRng, randInt, randBool, DEFAULT_SEED } from './__tests__/gen';
import { buildCheckpoint } from './checkpointBuilder';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  getMock: vi.fn(),
  validateMutationMock: vi.fn(),
  getDayMock: vi.fn(),
  getProfileMock: vi.fn(),
  getSyncedRecordIdMock: vi.fn(),
  setSyncedRecordIdMock: vi.fn(),
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      DailyRecord: { get: h.getMock },
    },
    mutations: {
      validateAndUpdateDailyRecord: h.validateMutationMock,
    },
  }),
}));

vi.mock('./db', () => ({
  getDay: h.getDayMock,
  getProfile: h.getProfileMock,
  getSyncedRecordId: h.getSyncedRecordIdMock,
  setSyncedRecordId: h.setSyncedRecordIdMock,
}));

import { createSynchronizer, ANTICHEAT_REJECT_TOKEN } from './synchronizer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = todayLocalDate();

/** Identidad activa por defecto: la mayoría de los tests sincronizan con este nick. */
const activeIdentity: ActiveIdentity = { nick: 'jugador1', userIdentityId: 'uid-1' };
const deps = { getIdentity: () => activeIdentity };
/** Sesión sin nick: el guard del criterio 7.4 debe cortar el envío. */
const noIdentityDeps = { getIdentity: () => null };

function makeProfile(): ProfileRecord {
  return {
    gameState: {
      xp: 120,
      level: 3,
      hp: 100,
      flowSeconds: 130,
      goodSecondsToday: 0,
      mood: 'idle',
      achievements: [],
      streakDays: 0,
      lastTickAt: 0,
    },
    calibration: null,
    teamCode: 'ABCD',
  };
}

/** Vacía la cola de microtareas para que corran los awaits de un syncNow disparado con `void`. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();

  // Datos locales por defecto
  h.getDayMock.mockResolvedValue([]);
  h.getProfileMock.mockResolvedValue(makeProfile());
  h.getSyncedRecordIdMock.mockResolvedValue(null);
  h.setSyncedRecordIdMock.mockResolvedValue(undefined);

  // Respuestas de la nube por defecto: todo pasa por la mutación validada
  h.getMock.mockResolvedValue({
    data: { id: 'rec-1', goodPostureSeconds: 100, updatedAt: new Date().toISOString() },
    errors: undefined,
  });
  h.validateMutationMock.mockResolvedValue({
    data: { id: 'rec-1', date: today, goodPostureSeconds: 100 },
    errors: undefined,
  });

  // Navegador online
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('synchronizer · upsert de DailyRecord vía la mutación validada', () => {
  it('primer sync sin id previo: llama a la mutación sin id y guarda el id devuelto', async () => {
    const sync = createSynchronizer(deps);
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalledOnce();
    expect(h.validateMutationMock.mock.calls[0][0]).toMatchObject({ id: undefined });
    expect(h.setSyncedRecordIdMock).toHaveBeenCalledWith(expect.any(String), 'rec-1');
  });

  it('sync con id previo: llama a la mutación con ese id y no crea otro registro', async () => {
    h.getSyncedRecordIdMock.mockResolvedValue('rec-1');

    const sync = createSynchronizer(deps);
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalledOnce();
    expect(h.validateMutationMock.mock.calls[0][0]).toMatchObject({ id: 'rec-1' });
  });

  it('reintenta con backoff si la mutación falla por infraestructura y luego lo consigue', async () => {
    h.validateMutationMock
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce({ data: { id: 'rec-2', date: today, goodPostureSeconds: 100 }, errors: undefined });

    const sync = createSynchronizer(deps, { baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalledTimes(2);
    expect(h.setSyncedRecordIdMock).toHaveBeenCalledWith(expect.any(String), 'rec-2');
  });

  it('la mutación lleva displayName igual al Nick activo tal cual está almacenado', async () => {
    const sync = createSynchronizer(deps);
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: activeIdentity.nick }),
    );
  });
});

describe('synchronizer · validación anti-trampa', () => {
  beforeEach(() => {
    h.getSyncedRecordIdMock.mockResolvedValue('rec-1');
  });

  it('persiste el id devuelto cuando el servidor valida el checkpoint', async () => {
    const sync = createSynchronizer(deps, { baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalledOnce();
    expect(h.setSyncedRecordIdMock).toHaveBeenCalledWith(expect.any(String), 'rec-1');
  });

  it('descarta el checkpoint sin reintentar si el servidor lo rechaza por trampa', async () => {
    h.validateMutationMock.mockResolvedValue({
      data: null,
      errors: [{ message: 'ANTICHEAT_REJECT: incremento de 5000s excede los 300s permitidos' }],
    });

    const sync = createSynchronizer(deps, { baseRetryMs: 1 });
    await sync.syncNow();

    // Rechazo anti-trampa: los mismos números volverían a rechazarse, así que
    // no se reintenta (Requisito 13 criterio 13).
    expect(h.validateMutationMock).toHaveBeenCalledOnce();
    expect(h.setSyncedRecordIdMock).not.toHaveBeenCalled();
  });

  it('reintenta con backoff si la mutación falla sin token anti-trampa (error de infraestructura)', async () => {
    h.validateMutationMock.mockResolvedValue({
      data: null,
      errors: [{ message: 'Cannot query field validateAndUpdateDailyRecord' }],
    });

    const sync = createSynchronizer(deps, { baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalledTimes(3); // maxRetries por defecto
    expect(h.setSyncedRecordIdMock).not.toHaveBeenCalled();
  });

  it('reintenta con backoff si la mutación lanza excepción (red caída)', async () => {
    h.validateMutationMock.mockRejectedValue(new Error('red caída'));

    const sync = createSynchronizer(deps, { baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalledTimes(3);
    expect(h.setSyncedRecordIdMock).not.toHaveBeenCalled();
  });
});

describe('synchronizer · guards', () => {
  it('no envía si no hay red', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const sync = createSynchronizer(deps);
    await sync.syncNow();

    expect(h.validateMutationMock).not.toHaveBeenCalled();
  });

  it('no envía si no hay identidad activa: cero operaciones, ni siquiera lecturas locales', async () => {
    const sync = createSynchronizer(noIdentityDeps);
    await sync.syncNow();

    // El guard de getIdentity() === null corta antes de leer getDay/getProfile
    // (ver synchronizer.ts): sin Nick activo no se emite ninguna operación,
    // ni de red ni de IndexedDB_Local (Req 5.8, 7.4).
    expect(h.getDayMock).not.toHaveBeenCalled();
    expect(h.getProfileMock).not.toHaveBeenCalled();
    expect(h.validateMutationMock).not.toHaveBeenCalled();
  });

  it('dos syncNow concurrentes solo producen un envío (anti-solape)', async () => {
    // mutación lenta para que el segundo syncNow entre mientras el primero corre
    h.validateMutationMock.mockImplementation(
      () =>
        new Promise((res) =>
          setTimeout(() => res({ data: { id: 'rec-1', date: today, goodPostureSeconds: 100 }, errors: undefined }), 10),
        ),
    );

    const sync = createSynchronizer(deps);
    const p1 = sync.syncNow();
    const p2 = sync.syncNow();
    await Promise.all([p1, p2]);

    expect(h.validateMutationMock).toHaveBeenCalledOnce();
  });
});

describe('synchronizer · start/stop', () => {
  it('start() dispara un sync inmediato (no espera al intervalo)', async () => {
    const sync = createSynchronizer(deps);
    sync.start();
    await vi.waitFor(() => expect(h.validateMutationMock).toHaveBeenCalledOnce());
    sync.stop();
  });

  it('tras stop() ya no sincroniza al reconectar', async () => {
    const sync = createSynchronizer(deps);
    sync.start();
    await vi.waitFor(() => expect(h.validateMutationMock).toHaveBeenCalledOnce());
    sync.stop();
    h.validateMutationMock.mockClear();

    window.dispatchEvent(new Event('online'));
    await flush();

    expect(h.validateMutationMock).not.toHaveBeenCalled();
  });
});

// ─── Property 11 ────────────────────────────────────────────────────────────

/**
 * Doble cliente en memoria que simula el lado servidor de
 * `validateAndUpdateDailyRecord`: sin `id` crea una fila nueva con un
 * identificador incremental, con `id` actualiza la fila existente. Traza
 * todos los ids que ha creado alguna vez para poder comprobar que nunca hay
 * más de una fila por combinación de Nick y fecha.
 */
function installFakeDailyRecordWriter(): { createdRowIds: Set<string> } {
  let recordId: string | null = null;
  let nextRowNumber = 1;
  const createdRowIds = new Set<string>();

  h.getSyncedRecordIdMock.mockImplementation(async () => recordId);
  h.setSyncedRecordIdMock.mockImplementation(async (_date: string, id: string) => {
    recordId = id;
  });
  h.validateMutationMock.mockImplementation(async (args: { id?: string }) => {
    if (args.id === undefined) {
      const id = `rec-${nextRowNumber++}`;
      createdRowIds.add(id);
      return { data: { id, date: today, goodPostureSeconds: 0 }, errors: undefined };
    }
    return { data: { id: args.id, date: today, goodPostureSeconds: 0 }, errors: undefined };
  });

  return { createdRowIds };
}

describe('synchronizer · Property 11 — como máximo un DailyRecord por Nick y fecha', () => {
  it('cualquier secuencia de syncNow para la misma fecha crea como máximo una fila', async () => {
    const rng = createRng(DEFAULT_SEED);
    const scenarios = 80;

    for (let scenario = 0; scenario < scenarios; scenario++) {
      // Nick distinto por escenario, siempre válido, para no acoplar la
      // propiedad a un único Nick.
      const scenarioIdentity: ActiveIdentity = {
        nick: `jugador${scenario % 50}`,
        userIdentityId: `uid-${scenario}`,
      };
      const scenarioDeps = { getIdentity: () => scenarioIdentity };

      const { createdRowIds } = installFakeDailyRecordWriter();
      h.validateMutationMock.mockClear();

      const numCalls = randInt(rng, 1, 6);
      const sync = createSynchronizer(scenarioDeps, { baseRetryMs: 1 });

      for (let call = 0; call < numCalls; call++) {
        await sync.syncNow();
      }

      const calls = h.validateMutationMock.mock.calls;
      expect(calls.length).toBe(numCalls);

      // La primera llamada de la secuencia no lleva id (simula un create).
      expect(calls[0][0]).toMatchObject({ id: undefined });

      // Como máximo se crea una fila para esta combinación de Nick y fecha.
      expect(createdRowIds.size).toBe(1);
      const [onlyRowId] = createdRowIds;

      // Todas las llamadas posteriores a la primera reutilizan ese único id
      // (simulan un update), nunca crean una segunda fila.
      for (let call = 1; call < numCalls; call++) {
        expect(calls[call][0]).toMatchObject({ id: onlyRowId });
      }
    }
  });
});

// ─── Property 12 ────────────────────────────────────────────────────────────

const NICK_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const TEAM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Nick válido (3-16 caracteres del alfabeto admitido): no se testea normalización aquí. */
function genValidNick(rng: ReturnType<typeof createRng>): string {
  const length = randInt(rng, 3, 16);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += NICK_CHARS[randInt(rng, 0, NICK_CHARS.length - 1)];
  }
  return out;
}

function genTeamCode(rng: ReturnType<typeof createRng>): string {
  const length = randInt(rng, 4, 10);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEAM_CODE_CHARS[randInt(rng, 0, TEAM_CODE_CHARS.length - 1)];
  }
  return out;
}

function genProfileScenario(rng: ReturnType<typeof createRng>): ProfileRecord {
  const hasTeamCode = randBool(rng, 0.5);
  return {
    gameState: {
      xp: randInt(rng, 0, 100000),
      level: randInt(rng, 1, 50),
      hp: randInt(rng, 0, 100),
      flowSeconds: randInt(rng, 0, 36000),
      goodSecondsToday: randInt(rng, 0, 86400),
      mood: 'idle',
      achievements: [],
      streakDays: randInt(rng, 0, 365),
      lastTickAt: 0,
    },
    calibration: null,
    ...(hasTeamCode && { teamCode: genTeamCode(rng) }),
  };
}

function genMinutes(rng: ReturnType<typeof createRng>): MinuteEntry[] {
  const count = randInt(rng, 0, 5);
  const minutes: MinuteEntry[] = [];
  for (let i = 0; i < count; i++) {
    minutes.push({
      date: today,
      minute: i,
      avgScore: randInt(rng, 0, 100),
      dominantStatus: randBool(rng) ? 'GOOD' : 'BAD',
      goodSeconds: randInt(rng, 0, 60),
    });
  }
  return minutes;
}

describe('synchronizer · Property 12 — forma de toda escritura del Sincronizador', () => {
  it('cada operación emitida lleva displayName, date y teamCode derivados del Nick activo y del perfil', async () => {
    const rng = createRng(DEFAULT_SEED);
    const scenarios = 120;

    for (let scenario = 0; scenario < scenarios; scenario++) {
      const nick = genValidNick(rng);
      const scenarioIdentity: ActiveIdentity = { nick, userIdentityId: `uid-${scenario}` };
      const scenarioDeps = { getIdentity: () => scenarioIdentity };

      const profile = genProfileScenario(rng);
      const minutes = genMinutes(rng);

      vi.clearAllMocks();
      h.getDayMock.mockResolvedValue(minutes);
      h.getProfileMock.mockResolvedValue(profile);
      h.getSyncedRecordIdMock.mockResolvedValue(null);
      h.setSyncedRecordIdMock.mockResolvedValue(undefined);
      h.validateMutationMock.mockResolvedValue({
        data: { id: 'rec-1', date: today, goodPostureSeconds: 0 },
        errors: undefined,
      });
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

      const expectedCheckpoint = buildCheckpoint(today, minutes, profile, profile.teamCode);

      const sync = createSynchronizer(scenarioDeps, { baseRetryMs: 1 });
      await sync.syncNow();

      expect(h.validateMutationMock).toHaveBeenCalledOnce();
      const callArgs = h.validateMutationMock.mock.calls[0][0] as Record<string, unknown>;

      // 1. displayName EXACTO: sin recortes ni normalización a minúsculas (Req 7.1)
      expect(callArgs.displayName).toBe(nick);

      // 2. date siempre la fecha local actual, nunca otra (Req 6.13, 5.9)
      expect(callArgs.date).toBe(today);

      // 3. teamCode del perfil cargado, o ausente si el perfil no tiene ninguno (Req 7.2)
      if (profile.teamCode === undefined) {
        expect(callArgs.teamCode).toBeUndefined();
      } else {
        expect(callArgs.teamCode).toBe(profile.teamCode);
      }

      // 4. Los campos agregados numéricos coinciden con el checkpoint construido
      //    a partir de las mismas entradas (chequeo de forma, no de buildCheckpoint).
      expect(callArgs.goodPostureSeconds).toBe(expectedCheckpoint.goodPostureSeconds);
      expect(callArgs.longestFlowStreak).toBe(expectedCheckpoint.longestFlowStreak);
      expect(callArgs.avgScore).toBe(expectedCheckpoint.avgScore);
      expect(callArgs.level).toBe(expectedCheckpoint.level);
      expect(callArgs.xp).toBe(expectedCheckpoint.xp);
    }
  });

  it('sin Nick activo se emiten cero operaciones (red y lecturas locales incluidas)', async () => {
    const rng = createRng(DEFAULT_SEED + 1);
    const scenarios = 30;

    for (let scenario = 0; scenario < scenarios; scenario++) {
      const profile = genProfileScenario(rng);
      const minutes = genMinutes(rng);

      vi.clearAllMocks();
      h.getDayMock.mockResolvedValue(minutes);
      h.getProfileMock.mockResolvedValue(profile);
      h.getSyncedRecordIdMock.mockResolvedValue(null);
      h.setSyncedRecordIdMock.mockResolvedValue(undefined);
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

      const sync = createSynchronizer(noIdentityDeps, { baseRetryMs: 1 });
      await sync.syncNow();

      expect(h.getDayMock).not.toHaveBeenCalled();
      expect(h.getProfileMock).not.toHaveBeenCalled();
      expect(h.validateMutationMock).not.toHaveBeenCalled();
      expect(h.setSyncedRecordIdMock).not.toHaveBeenCalled();
    }
  });
});

// ─── Property 16 (parte del cliente) ───────────────────────────────────────

/**
 * Restablece los dobles a su comportamiento por defecto para un escenario
 * de propiedad (mismo patrón que usa el `beforeEach` de arriba, pero
 * repetido dentro del bucle porque cada escenario configura su propia
 * respuesta de `validateMutationMock`).
 */
function resetDefaultMocksForScenario(): void {
  vi.clearAllMocks();
  h.getDayMock.mockResolvedValue([]);
  h.getProfileMock.mockResolvedValue(makeProfile());
  h.getSyncedRecordIdMock.mockResolvedValue(null);
  h.setSyncedRecordIdMock.mockResolvedValue(undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
}

const MESSAGE_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 :.,-()áéíóúñ';

function genRandomText(rng: ReturnType<typeof createRng>, minLen: number, maxLen: number): string {
  const length = randInt(rng, minLen, maxLen);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += MESSAGE_CHARS[randInt(rng, 0, MESSAGE_CHARS.length - 1)];
  }
  return out;
}

/** Mensaje de rechazo con el token en algún punto de una cadena por lo demás variable. */
function genTokenMessage(rng: ReturnType<typeof createRng>): string {
  const prefix = genRandomText(rng, 0, 30);
  const suffix = genRandomText(rng, 0, 30);
  return `${prefix}${ANTICHEAT_REJECT_TOKEN}${suffix}`;
}

/** Mensaje de fallo de infraestructura, garantizado sin el token anti-trampa. */
function genNonTokenMessage(rng: ReturnType<typeof createRng>): string {
  let candidate: string;
  do {
    candidate = genRandomText(rng, 1, 60);
  } while (candidate.includes(ANTICHEAT_REJECT_TOKEN));
  return candidate;
}

describe('synchronizer · Property 16 — clasificación del fallo (parte del cliente)', () => {
  it('con el token anti-trampa se abandona el envío sin reintentar, para cualquier mensaje que lo contenga', async () => {
    const rng = createRng(DEFAULT_SEED + 2);
    const scenarios = 120;

    for (let scenario = 0; scenario < scenarios; scenario++) {
      resetDefaultMocksForScenario();

      const message = genTokenMessage(rng);
      h.validateMutationMock.mockResolvedValue({ data: null, errors: [{ message }] });

      const sync = createSynchronizer(deps, { baseRetryMs: 1 });
      await sync.syncNow();

      // Rechazo anti-trampa: una sola llamada, sin backoff ni segundo intento
      // (Req 13.13). Los mismos números volverían a rechazarse.
      expect(h.validateMutationMock).toHaveBeenCalledOnce();
      expect(h.setSyncedRecordIdMock).not.toHaveBeenCalled();

      // Req 7.8: los datos locales se leen (nunca se saltan ni se borran) sea
      // cual sea la clasificación del fallo. `synchronizer.ts` solo importa
      // `getDay`/`getProfile`/`getSyncedRecordId`/`setSyncedRecordId` de
      // `./db`: no hay ninguna función de borrado en su superficie de import,
      // así que IndexedDB_Local queda intacto por construcción.
      expect(h.getDayMock).toHaveBeenCalled();
    }
  });

  it('sin el token anti-trampa se reintenta con backoff hasta maxRetries, para cualquier mensaje o excepción sin el token', async () => {
    const rng = createRng(DEFAULT_SEED + 3);
    const scenarios = 120;

    for (let scenario = 0; scenario < scenarios; scenario++) {
      resetDefaultMocksForScenario();

      const message = genNonTokenMessage(rng);
      const asThrownException = randBool(rng, 0.5);
      if (asThrownException) {
        h.validateMutationMock.mockRejectedValue(new Error(message));
      } else {
        h.validateMutationMock.mockResolvedValue({ data: null, errors: [{ message }] });
      }

      const sync = createSynchronizer(deps, { baseRetryMs: 1 });
      await sync.syncNow();

      // Fallo de infraestructura (sin token): se reintenta con backoff hasta
      // agotar maxRetries por defecto (3), nunca se abandona tras el primero.
      expect(h.validateMutationMock).toHaveBeenCalledTimes(3);
      expect(h.setSyncedRecordIdMock).not.toHaveBeenCalled();

      // Req 7.8: igual que en la clasificación de rechazo, los datos locales
      // siguen leyéndose (y por tanto conservándose) durante los reintentos.
      expect(h.getDayMock).toHaveBeenCalled();
    }
  });
});
