import { describe, it, expect } from 'vitest';
import {
  validateWrite,
  MAX_DAILY_SECONDS,
  TIMEZONE_SLACK_SECONDS,
  FLOW_ROUNDING_SLACK_SECONDS,
  TOLERANCE_FACTOR,
  DATE_WINDOW_DAYS,
  LEVEL_BASE_XP,
  LEVEL_EXPONENT,
  type CheckpointClaim,
  type AntiCheatRule,
  type AntiCheatVerdict,
} from './rules';

/**
 * Property 15: El veredicto anti-trampa es la conjunción de sus reglas.
 *
 * Sin librería de PBT (Desviación D4 del diseño): generador determinista
 * propio con PRNG xorshift32 y semilla fija. 200 casos por propiedad, sin
 * reducción automática de contraejemplos — al fallar se imprime la semilla y
 * el caso completo para poder reproducirlo a mano.
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

const SEED_CONJUNCTION = 20_260_615;
const SEED_INVARIANCE = 20_260_616;
const CASES = 200;

function randInt(rng: () => number, min: number, max: number): number {
  return min + (rng() % (max - min + 1));
}

function formatUtcDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Oráculo independiente ──────────────────────────────────────────────────
// Reimplementa las fórmulas del diseño (Property 15) sobre las constantes
// exportadas por rules.ts. No reutiliza las funciones privadas del módulo:
// es un segundo cálculo independiente para contrastar contra validateWrite.

function levelThreshold(level: number): number {
  return Math.floor(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

function utcMidnightMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** Devuelve la regla incumplida (en orden fijo) o null si las siete se cumplen. */
function oracleRule(claim: CheckpointClaim, receivedAtMs: number): AntiCheatRule | null {
  const inputMidnightMs = utcMidnightMs(claim.date);
  const received = new Date(receivedAtMs);
  const receivedMidnightMs = Date.UTC(
    received.getUTCFullYear(),
    received.getUTCMonth(),
    received.getUTCDate(),
  );
  const diffDays = Math.abs(receivedMidnightMs - inputMidnightMs) / 86_400_000;
  if (diffDays > DATE_WINDOW_DAYS) return 'DATE_WINDOW';

  if (claim.goodPostureSeconds > MAX_DAILY_SECONDS) return 'DAILY_MAX';

  const elapsedSeconds = (receivedAtMs - inputMidnightMs) / 1000;
  if (claim.goodPostureSeconds > elapsedSeconds + TIMEZONE_SLACK_SECONDS) return 'ELAPSED_TODAY';

  if (claim.longestFlowStreak * 60 > claim.goodPostureSeconds + FLOW_ROUNDING_SLACK_SECONDS) {
    return 'FLOW_VS_GOOD';
  }

  if (claim.avgScore < 0 || claim.avgScore > 100) return 'AVG_SCORE_RANGE';

  const { level, xp } = claim;
  const incoherent =
    level < 1 ||
    xp < 0 ||
    xp >= levelThreshold(level) ||
    (level > 1 && xp < levelThreshold(level - 1));
  if (incoherent) return 'LEVEL_XP_COHERENCE';

  const { previousGoodPostureSeconds, previousUpdatedAt } = claim;
  if (
    previousGoodPostureSeconds === undefined ||
    previousGoodPostureSeconds === null ||
    !previousUpdatedAt
  ) {
    return null;
  }
  const increment = claim.goodPostureSeconds - previousGoodPostureSeconds;
  if (increment <= 0) return null;

  const elapsedSincePrev = (receivedAtMs - Date.parse(previousUpdatedAt)) / 1000;
  if (increment > elapsedSincePrev * TOLERANCE_FACTOR) return 'INCREMENT_VS_ELAPSED';
  return null;
}

const FIRST_SIX_RULES: readonly AntiCheatRule[] = [
  'DATE_WINDOW',
  'DAILY_MAX',
  'ELAPSED_TODAY',
  'FLOW_VS_GOOD',
  'AVG_SCORE_RANGE',
  'LEVEL_XP_COHERENCE',
];

// ─── Generador de casos aleatorios ──────────────────────────────────────────

interface GeneratedCase {
  claim: CheckpointClaim;
  receivedAtMs: number;
}

function generateCase(rng: () => number): GeneratedCase {
  const baseMs = Date.UTC(2026, 5, 15, 0, 0, 0);
  const receivedAtMs = baseMs + randInt(rng, 0, 6) * 86_400_000 + randInt(rng, 0, 86_399) * 1000;

  // El desfase de días cubre a propósito dentro y fuera de la ventana de 1 día.
  const dayOffset = randInt(rng, -3, 3);
  const date = formatUtcDate(receivedAtMs + dayOffset * 86_400_000);

  const goodPostureSeconds = randInt(rng, 0, Math.floor(MAX_DAILY_SECONDS * 1.2));
  const longestFlowStreak = randInt(rng, 0, Math.floor(goodPostureSeconds / 60) + 5);
  const avgScore = randInt(rng, -10, 110);
  const level = randInt(rng, 0, 5);
  const threshold = levelThreshold(Math.max(level, 1));
  const xp = randInt(rng, -50, threshold + 100);

  const prevVariant = randInt(rng, 0, 3);
  let previousGoodPostureSeconds: number | null | undefined;
  let previousUpdatedAt: string | null | undefined;
  if (prevVariant === 0) {
    previousGoodPostureSeconds = undefined;
    previousUpdatedAt = undefined;
  } else if (prevVariant === 1) {
    previousGoodPostureSeconds = null;
    previousUpdatedAt = null;
  } else {
    previousGoodPostureSeconds = randInt(rng, 0, MAX_DAILY_SECONDS);
    const prevOffsetSeconds = randInt(rng, 0, 6 * 86_400);
    previousUpdatedAt = new Date(receivedAtMs - prevOffsetSeconds * 1000).toISOString();
  }

  return {
    claim: {
      date,
      goodPostureSeconds,
      longestFlowStreak,
      avgScore,
      level,
      xp,
      previousGoodPostureSeconds,
      previousUpdatedAt,
    },
    receivedAtMs,
  };
}

// ─── Property 15: conjunción y orden fijo ──────────────────────────────────

describe('Property 15: el veredicto anti-trampa es la conjunción de sus reglas', () => {
  it(`acepta si y solo si las siete reglas se cumplen, reportando la primera incumplida en orden fijo (${CASES} casos, semilla ${SEED_CONJUNCTION})`, () => {
    const rng = xorshift32(SEED_CONJUNCTION);

    for (let i = 0; i < CASES; i++) {
      const { claim, receivedAtMs } = generateCase(rng);
      const expectedRule = oracleRule(claim, receivedAtMs);
      const verdict = validateWrite(claim, receivedAtMs);

      if (expectedRule === null) {
        if (!verdict.ok) {
          throw new Error(
            `[semilla=${SEED_CONJUNCTION}, caso=${i}] esperado {ok:true}, obtenido ${JSON.stringify(verdict)}.\n` +
              `Caso: ${JSON.stringify({ claim, receivedAtMs })}`,
          );
        }
      } else if (verdict.ok || verdict.rule !== expectedRule) {
        throw new Error(
          `[semilla=${SEED_CONJUNCTION}, caso=${i}] esperado rule=${expectedRule}, obtenido ${JSON.stringify(verdict)}.\n` +
            `Caso: ${JSON.stringify({ claim, receivedAtMs })}`,
        );
      }
    }
  });
});

// ─── Property 15 (invariancia): las seis primeras reglas ignoran los valores previos ──

type SixRuleOutcome = { ok: true } | { ok: false; rule: AntiCheatRule; message: string };

function sixRuleOutcome(verdict: AntiCheatVerdict): SixRuleOutcome {
  if (!verdict.ok && FIRST_SIX_RULES.includes(verdict.rule)) {
    return { ok: false, rule: verdict.rule, message: verdict.message };
  }
  return { ok: true };
}

function sameOutcome(a: SixRuleOutcome, b: SixRuleOutcome): boolean {
  if (a.ok !== b.ok) return false;
  if (!a.ok && !b.ok) return a.rule === b.rule && a.message === b.message;
  return true;
}

describe('Property 15 (invariancia): las seis primeras reglas no dependen de previousGoodPostureSeconds ni previousUpdatedAt', () => {
  it(`el resultado de las seis primeras reglas es idéntico al variar los valores previos (${CASES} casos, semilla ${SEED_INVARIANCE})`, () => {
    const rng = xorshift32(SEED_INVARIANCE);

    for (let i = 0; i < CASES; i++) {
      const { claim: baseClaim, receivedAtMs } = generateCase(rng);
      const { previousGoodPostureSeconds: _p, previousUpdatedAt: _pa, ...rest } = baseClaim;

      const previousVariants: Array<Pick<CheckpointClaim, 'previousGoodPostureSeconds' | 'previousUpdatedAt'>> = [
        { previousGoodPostureSeconds: undefined, previousUpdatedAt: undefined },
        { previousGoodPostureSeconds: null, previousUpdatedAt: null },
        {
          previousGoodPostureSeconds: randInt(rng, 0, MAX_DAILY_SECONDS),
          previousUpdatedAt: new Date(receivedAtMs - randInt(rng, 0, 6 * 86_400) * 1000).toISOString(),
        },
        {
          previousGoodPostureSeconds: randInt(rng, 0, MAX_DAILY_SECONDS),
          previousUpdatedAt: new Date(receivedAtMs + randInt(rng, 1, 6 * 86_400) * 1000).toISOString(),
        },
      ];

      const outcomes = previousVariants.map((variant) =>
        sixRuleOutcome(validateWrite({ ...rest, ...variant }, receivedAtMs)),
      );

      for (let v = 1; v < outcomes.length; v++) {
        if (!sameOutcome(outcomes[0], outcomes[v])) {
          throw new Error(
            `[semilla=${SEED_INVARIANCE}, caso=${i}] la variante ${v} de valores previos cambia el resultado de las seis primeras reglas.\n` +
              `Base: ${JSON.stringify(rest)}\nVariantes: ${JSON.stringify(previousVariants)}\nResultados: ${JSON.stringify(outcomes)}`,
          );
        }
      }
    }
  });
});

// ─── Casos de frontera y ejemplo, uno por regla ────────────────────────────
// Cada caso mantiene el resto de reglas en un estado válido para aislar la
// regla bajo prueba, según el orden fijo DATE_WINDOW → DAILY_MAX →
// ELAPSED_TODAY → FLOW_VS_GOOD → AVG_SCORE_RANGE → LEVEL_XP_COHERENCE →
// INCREMENT_VS_ELAPSED.

/** date=D, receivedAtMs=D+1 00:00 UTC ⇒ diffDays=1 (dentro de ventana) y elapsed=86400 s (mucho margen). */
const WIDE_MARGIN_DATE = '2026-06-15';
const WIDE_MARGIN_RECEIVED_MS = Date.UTC(2026, 5, 16, 0, 0, 0);

function wideMarginValidClaim(overrides: Partial<CheckpointClaim> = {}): CheckpointClaim {
  return {
    date: WIDE_MARGIN_DATE,
    goodPostureSeconds: 1000,
    longestFlowStreak: 0,
    avgScore: 50,
    level: 1,
    xp: 0,
    previousGoodPostureSeconds: undefined,
    previousUpdatedAt: undefined,
    ...overrides,
  };
}

describe('Property 15: casos de frontera y ejemplo por regla', () => {
  it('acepta un caso plenamente válido', () => {
    const verdict = validateWrite(wideMarginValidClaim(), WIDE_MARGIN_RECEIVED_MS);
    expect(verdict).toEqual({ ok: true });
  });

  it('DATE_WINDOW: acepta en la frontera de 1 día y rechaza a 2 días', () => {
    const receivedAtMs = Date.UTC(2026, 5, 20, 12, 0, 0);

    const atBoundary = validateWrite(
      wideMarginValidClaim({ date: '2026-06-19', goodPostureSeconds: 0 }),
      receivedAtMs,
    );
    expect(atBoundary).toEqual({ ok: true });

    const beyondBoundary = validateWrite(
      wideMarginValidClaim({ date: '2026-06-18', goodPostureSeconds: 0 }),
      receivedAtMs,
    );
    expect(beyondBoundary.ok).toBe(false);
    expect((beyondBoundary as { rule: AntiCheatRule }).rule).toBe('DATE_WINDOW');
  });

  it('DAILY_MAX: acepta exactamente en el máximo diario y rechaza un segundo más', () => {
    const atMax = validateWrite(
      wideMarginValidClaim({ goodPostureSeconds: MAX_DAILY_SECONDS }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(atMax).toEqual({ ok: true });

    const overMax = validateWrite(
      wideMarginValidClaim({ goodPostureSeconds: MAX_DAILY_SECONDS + 1 }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(overMax.ok).toBe(false);
    expect((overMax as { rule: AntiCheatRule }).rule).toBe('DAILY_MAX');
  });

  it('ELAPSED_TODAY: acepta en la frontera del margen y rechaza un segundo más', () => {
    // elapsed = 3600 s ⇒ máximo permitido = 3600 + TIMEZONE_SLACK_SECONDS.
    const receivedAtMs = Date.UTC(2026, 5, 15, 1, 0, 0);
    const maxAllowed = 3600 + TIMEZONE_SLACK_SECONDS;

    const atBoundary = validateWrite(wideMarginValidClaim({ goodPostureSeconds: maxAllowed }), receivedAtMs);
    expect(atBoundary).toEqual({ ok: true });

    const overBoundary = validateWrite(
      wideMarginValidClaim({ goodPostureSeconds: maxAllowed + 1 }),
      receivedAtMs,
    );
    expect(overBoundary.ok).toBe(false);
    expect((overBoundary as { rule: AntiCheatRule }).rule).toBe('ELAPSED_TODAY');
  });

  it('FLOW_VS_GOOD: acepta en la frontera del margen de redondeo y rechaza un minuto más', () => {
    // goodPostureSeconds=1000 ⇒ máximo longestFlowStreak = floor((1000+60)/60) = 17.
    const atBoundary = validateWrite(
      wideMarginValidClaim({ goodPostureSeconds: 1000, longestFlowStreak: 17 }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(atBoundary).toEqual({ ok: true });

    const overBoundary = validateWrite(
      wideMarginValidClaim({ goodPostureSeconds: 1000, longestFlowStreak: 18 }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(overBoundary.ok).toBe(false);
    expect((overBoundary as { rule: AntiCheatRule }).rule).toBe('FLOW_VS_GOOD');
  });

  it('AVG_SCORE_RANGE: acepta 0 y 100, rechaza fuera de ese rango', () => {
    expect(validateWrite(wideMarginValidClaim({ avgScore: 0 }), WIDE_MARGIN_RECEIVED_MS)).toEqual({ ok: true });
    expect(validateWrite(wideMarginValidClaim({ avgScore: 100 }), WIDE_MARGIN_RECEIVED_MS)).toEqual({ ok: true });

    const belowRange = validateWrite(wideMarginValidClaim({ avgScore: -0.01 }), WIDE_MARGIN_RECEIVED_MS);
    expect(belowRange.ok).toBe(false);
    expect((belowRange as { rule: AntiCheatRule }).rule).toBe('AVG_SCORE_RANGE');

    const aboveRange = validateWrite(wideMarginValidClaim({ avgScore: 100.01 }), WIDE_MARGIN_RECEIVED_MS);
    expect(aboveRange.ok).toBe(false);
    expect((aboveRange as { rule: AntiCheatRule }).rule).toBe('AVG_SCORE_RANGE');
  });

  it('LEVEL_XP_COHERENCE: acepta justo bajo el umbral de nivel y rechaza en el umbral', () => {
    const threshold1 = levelThreshold(1); // 100

    const belowThreshold = validateWrite(
      wideMarginValidClaim({ level: 1, xp: threshold1 - 1 }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(belowThreshold).toEqual({ ok: true });

    const atThreshold = validateWrite(wideMarginValidClaim({ level: 1, xp: threshold1 }), WIDE_MARGIN_RECEIVED_MS);
    expect(atThreshold.ok).toBe(false);
    expect((atThreshold as { rule: AntiCheatRule }).rule).toBe('LEVEL_XP_COHERENCE');

    // level=2: coherente solo si threshold(1) <= xp < threshold(2).
    const belowLowerBound = validateWrite(
      wideMarginValidClaim({ level: 2, xp: threshold1 - 1 }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(belowLowerBound.ok).toBe(false);
    expect((belowLowerBound as { rule: AntiCheatRule }).rule).toBe('LEVEL_XP_COHERENCE');

    const atLowerBound = validateWrite(wideMarginValidClaim({ level: 2, xp: threshold1 }), WIDE_MARGIN_RECEIVED_MS);
    expect(atLowerBound).toEqual({ ok: true });
  });

  it('INCREMENT_VS_ELAPSED: acepta en la frontera de tolerancia y rechaza un segundo más', () => {
    const elapsedSincePrev = 1000;
    const maxIncrement = Math.floor(elapsedSincePrev * TOLERANCE_FACTOR); // 1100
    const previousUpdatedAt = new Date(WIDE_MARGIN_RECEIVED_MS - elapsedSincePrev * 1000).toISOString();

    const atBoundary = validateWrite(
      wideMarginValidClaim({
        goodPostureSeconds: 5000,
        previousGoodPostureSeconds: 5000 - maxIncrement,
        previousUpdatedAt,
      }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(atBoundary).toEqual({ ok: true });

    const overBoundary = validateWrite(
      wideMarginValidClaim({
        goodPostureSeconds: 5000,
        previousGoodPostureSeconds: 5000 - maxIncrement - 1,
        previousUpdatedAt,
      }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(overBoundary.ok).toBe(false);
    expect((overBoundary as { rule: AntiCheatRule }).rule).toBe('INCREMENT_VS_ELAPSED');
  });

  it('INCREMENT_VS_ELAPSED no se evalúa sin valores previos completos', () => {
    const onlyPrevSeconds = validateWrite(
      wideMarginValidClaim({ previousGoodPostureSeconds: 999_999, previousUpdatedAt: undefined }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(onlyPrevSeconds).toEqual({ ok: true });

    const onlyPrevDate = validateWrite(
      wideMarginValidClaim({ previousGoodPostureSeconds: null, previousUpdatedAt: '2020-01-01T00:00:00.000Z' }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(onlyPrevDate).toEqual({ ok: true });
  });

  it('reporta la regla más temprana en orden fijo cuando varias reglas fallan a la vez', () => {
    // Fecha muy lejana (DATE_WINDOW) y segundos por encima del máximo diario (DAILY_MAX)
    // a la vez: debe reportarse DATE_WINDOW por evaluarse primero.
    const verdict = validateWrite(
      wideMarginValidClaim({ date: '2026-05-01', goodPostureSeconds: 200_000 }),
      WIDE_MARGIN_RECEIVED_MS,
    );
    expect(verdict.ok).toBe(false);
    expect((verdict as { rule: AntiCheatRule }).rule).toBe('DATE_WINDOW');
  });
});
