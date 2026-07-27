import { describe, it, expect } from 'vitest';
import {
  handleValidatedUpdate,
  ANTICHEAT_REJECT_TOKEN,
  type DailyRecordWriter,
  type DailyRecordFields,
  type DailyRecordWriteResult,
  type ValidatedUpdateArgs,
} from './decision';
import { MAX_DAILY_SECONDS, LEVEL_BASE_XP, LEVEL_EXPONENT } from './rules';

/**
 * Property 16 (parte del handler): Efecto del veredicto y clasificación del fallo.
 *
 * Sin librería de PBT (Desviación D4 del diseño): generador determinista propio
 * con PRNG xorshift32 y semilla fija. 200 casos por propiedad, sin reducción
 * automática de contraejemplos — al fallar se imprime la semilla y el caso
 * completo para poder reproducirlo a mano.
 */

// ─── PRNG determinista ─────────────────────────────────────────────────────

function xorshift32(seed: number): () => number {
  let state = seed || 1;
  return function next(): number {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

const SEED_REJECT = 20_260_617;
const SEED_ACCEPT = 20_260_618;
const CASES = 200;

function randInt(rng: () => number, min: number, max: number): number {
  return min + (rng() % (max - min + 1));
}

// ─── fakeDailyRecordWriter ──────────────────────────────────────────────────

interface FakeWriterTrace {
  creates: DailyRecordFields[];
  updates: Array<{ id: string; fields: DailyRecordFields }>;
}

function fakeDailyRecordWriter(): { writer: DailyRecordWriter; trace: FakeWriterTrace } {
  const trace: FakeWriterTrace = { creates: [], updates: [] };
  let nextId = 1;

  const writer: DailyRecordWriter = {
    async create(fields: DailyRecordFields): Promise<DailyRecordWriteResult> {
      trace.creates.push(fields);
      const id = `fake-${nextId++}`;
      return { id, date: fields.date, goodPostureSeconds: fields.goodPostureSeconds };
    },
    async update(id: string, fields: DailyRecordFields): Promise<DailyRecordWriteResult> {
      trace.updates.push({ id, fields });
      return { id, date: fields.date, goodPostureSeconds: fields.goodPostureSeconds };
    },
  };

  return { writer, trace };
}

function totalWrites(trace: FakeWriterTrace): number {
  return trace.creates.length + trace.updates.length;
}

function levelThreshold(level: number): number {
  return Math.floor(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

// ─── Generadores de casos ───────────────────────────────────────────────────

const RECEIVED_AT_MS = Date.UTC(2026, 5, 15, 12, 0, 0);
const VALID_DATE = '2026-06-15'; // mismo día UTC que RECEIVED_AT_MS

/** Genera un caso engineered para ser rechazado por validateWrite (regla DAILY_MAX o DATE_WINDOW). */
function generateRejectedArgs(rng: () => number): ValidatedUpdateArgs {
  const variant = randInt(rng, 0, 1);
  const hasId = randInt(rng, 0, 1) === 1;

  const base: ValidatedUpdateArgs = {
    id: hasId ? `existing-${randInt(rng, 1, 1000)}` : undefined,
    date: VALID_DATE,
    displayName: `jugador${randInt(rng, 1, 999)}`,
    goodPostureSeconds: randInt(rng, 0, 1000),
    longestFlowStreak: 0,
    avgScore: 50,
    level: 1,
    xp: 0,
    previousGoodPostureSeconds: undefined,
    previousUpdatedAt: undefined,
    teamCode: undefined,
  };

  if (variant === 0) {
    // DAILY_MAX: muy por encima del máximo diario.
    base.goodPostureSeconds = MAX_DAILY_SECONDS + randInt(rng, 1, 1_000_000);
  } else {
    // DATE_WINDOW: fecha muy lejana a la de recepción.
    base.date = '2000-01-01';
  }

  return base;
}

/** Genera un caso engineered para ser aceptado por validateWrite. */
function generateAcceptedArgs(rng: () => number): ValidatedUpdateArgs {
  const hasId = randInt(rng, 0, 1) === 1;
  const goodPostureSeconds = randInt(rng, 0, 1000);
  const level = randInt(rng, 1, 3);
  const threshold = levelThreshold(level);
  const lowerBound = level > 1 ? levelThreshold(level - 1) : 0;
  const xp = randInt(rng, lowerBound, threshold - 1);

  return {
    id: hasId ? `existing-${randInt(rng, 1, 1000)}` : undefined,
    date: VALID_DATE,
    displayName: `jugador${randInt(rng, 1, 999)}`,
    goodPostureSeconds,
    longestFlowStreak: Math.floor(goodPostureSeconds / 60),
    avgScore: randInt(rng, 0, 100),
    level,
    xp,
    previousGoodPostureSeconds: undefined,
    previousUpdatedAt: undefined,
    teamCode: randInt(rng, 0, 1) === 1 ? `equipo${randInt(rng, 1, 9)}` : undefined,
  };
}

// ─── Property 16 (parte del handler): rechazo ⇒ cero escrituras ───────────

describe('Property 16 (handler): al rechazar, cero escrituras y mensaje prefijado por ANTICHEAT_REJECT', () => {
  it(`ninguna escritura se emite y el error empieza por ${ANTICHEAT_REJECT_TOKEN} (${CASES} casos, semilla ${SEED_REJECT})`, async () => {
    const rng = xorshift32(SEED_REJECT);

    for (let i = 0; i < CASES; i++) {
      const args = generateRejectedArgs(rng);
      const { writer, trace } = fakeDailyRecordWriter();

      let thrown: unknown = null;
      try {
        await handleValidatedUpdate(args, writer, RECEIVED_AT_MS);
      } catch (err) {
        thrown = err;
      }

      if (!(thrown instanceof Error)) {
        throw new Error(
          `[semilla=${SEED_REJECT}, caso=${i}] se esperaba que handleValidatedUpdate lanzara un Error.\n` +
            `Caso: ${JSON.stringify(args)}`,
        );
      }
      if (!thrown.message.startsWith(ANTICHEAT_REJECT_TOKEN)) {
        throw new Error(
          `[semilla=${SEED_REJECT}, caso=${i}] el mensaje no empieza por ${ANTICHEAT_REJECT_TOKEN}: "${thrown.message}".\n` +
            `Caso: ${JSON.stringify(args)}`,
        );
      }
      if (totalWrites(trace) !== 0) {
        throw new Error(
          `[semilla=${SEED_REJECT}, caso=${i}] se esperaban 0 escrituras, hubo ${totalWrites(trace)}.\n` +
            `Caso: ${JSON.stringify(args)}\nTraza: ${JSON.stringify(trace)}`,
        );
      }
    }
  });
});

// ─── Property 16 (parte del handler): aceptación ⇒ exactamente una escritura ──

describe('Property 16 (handler): al aceptar, exactamente una escritura', () => {
  it(`se resuelve con {id, date, goodPostureSeconds} y la traza tiene exactamente una escritura (${CASES} casos, semilla ${SEED_ACCEPT})`, async () => {
    const rng = xorshift32(SEED_ACCEPT);

    for (let i = 0; i < CASES; i++) {
      const args = generateAcceptedArgs(rng);
      const { writer, trace } = fakeDailyRecordWriter();

      const result = await handleValidatedUpdate(args, writer, RECEIVED_AT_MS);

      if (
        typeof result.id !== 'string' ||
        result.date !== args.date ||
        result.goodPostureSeconds !== args.goodPostureSeconds
      ) {
        throw new Error(
          `[semilla=${SEED_ACCEPT}, caso=${i}] resultado inesperado: ${JSON.stringify(result)}.\n` +
            `Caso: ${JSON.stringify(args)}`,
        );
      }

      if (totalWrites(trace) !== 1) {
        throw new Error(
          `[semilla=${SEED_ACCEPT}, caso=${i}] se esperaba exactamente 1 escritura, hubo ${totalWrites(trace)}.\n` +
            `Caso: ${JSON.stringify(args)}\nTraza: ${JSON.stringify(trace)}`,
        );
      }

      const expectedKind = args.id ? 'update' : 'create';
      const actualKind = trace.creates.length === 1 ? 'create' : 'update';
      if (actualKind !== expectedKind) {
        throw new Error(
          `[semilla=${SEED_ACCEPT}, caso=${i}] se esperaba ${expectedKind}, ocurrió ${actualKind}.\n` +
            `Caso: ${JSON.stringify(args)}\nTraza: ${JSON.stringify(trace)}`,
        );
      }
    }
  });
});

// ─── Casos de ejemplo ───────────────────────────────────────────────────────

describe('Property 16 (handler): casos de ejemplo', () => {
  it('rechaza sin escribir cuando goodPostureSeconds excede el máximo diario', async () => {
    const { writer, trace } = fakeDailyRecordWriter();
    const args: ValidatedUpdateArgs = {
      date: VALID_DATE,
      displayName: 'jugador1',
      goodPostureSeconds: MAX_DAILY_SECONDS + 1,
    };

    await expect(handleValidatedUpdate(args, writer, RECEIVED_AT_MS)).rejects.toThrow(
      new RegExp(`^${ANTICHEAT_REJECT_TOKEN}`),
    );
    expect(totalWrites(trace)).toBe(0);
  });

  it('crea (sin id) cuando el veredicto acepta y no llega id', async () => {
    const { writer, trace } = fakeDailyRecordWriter();
    const args: ValidatedUpdateArgs = {
      date: VALID_DATE,
      displayName: 'jugador1',
      goodPostureSeconds: 100,
      longestFlowStreak: 1,
      avgScore: 50,
      level: 1,
      xp: 0,
    };

    const result = await handleValidatedUpdate(args, writer, RECEIVED_AT_MS);

    expect(trace.creates).toHaveLength(1);
    expect(trace.updates).toHaveLength(0);
    expect(result).toEqual({ id: expect.any(String), date: VALID_DATE, goodPostureSeconds: 100 });
  });

  it('actualiza (con id) cuando el veredicto acepta y llega id', async () => {
    const { writer, trace } = fakeDailyRecordWriter();
    const args: ValidatedUpdateArgs = {
      id: 'record-1',
      date: VALID_DATE,
      displayName: 'jugador1',
      goodPostureSeconds: 100,
      longestFlowStreak: 1,
      avgScore: 50,
      level: 1,
      xp: 0,
    };

    const result = await handleValidatedUpdate(args, writer, RECEIVED_AT_MS);

    expect(trace.updates).toHaveLength(1);
    expect(trace.creates).toHaveLength(0);
    expect(trace.updates[0].id).toBe('record-1');
    expect(result).toEqual({ id: 'record-1', date: VALID_DATE, goodPostureSeconds: 100 });
  });
});
