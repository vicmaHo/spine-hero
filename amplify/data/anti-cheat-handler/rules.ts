/**
 * Reglas puras del Validador_AntiTrampa.
 *
 * Separadas del handler para poder testearlas con Vitest sin AWS ni red.
 * Módulo puro: sin DOM, sin `Date.now()` interno (el instante de recepción
 * se recibe como parámetro `receivedAtMs`), sin efectos.
 *
 * `amplify/` no puede importar de `src/` (grafos de módulos separados), así
 * que `LEVEL_BASE_XP` y `LEVEL_EXPONENT` son un duplicado deliberado de las
 * constantes homónimas de `src/game/engine.ts`. Si cambian ahí, cambian aquí.
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Máximo absoluto de segundos de buena postura en un día natural. */
export const MAX_DAILY_SECONDS = 86_400;

/** Margen que absorbe el desfase máximo de zona horaria cliente/servidor. */
export const TIMEZONE_SLACK_SECONDS = 50_400;

/** Margen por el redondeo de `longestFlowStreak` a minutos completos. */
export const FLOW_ROUNDING_SLACK_SECONDS = 60;

/** Margen de tolerancia (10%) sobre el tiempo transcurrido desde la última escritura. */
export const TOLERANCE_FACTOR = 1.1;

/** Días de margen permitidos entre la fecha declarada y la fecha UTC de recepción. */
export const DATE_WINDOW_DAYS = 1;

// Duplicados de src/game/engine.ts: amplify/ no puede importar de src/.
export const LEVEL_BASE_XP = 100;
export const LEVEL_EXPONENT = 1.5;

// ─── Tipos ────────────────────────────────────────────────────────────────────

/**
 * Argumentos de `validateAndUpdateDailyRecord` relevantes para el
 * Validador_AntiTrampa. `date` llega en formato `YYYY-MM-DD`.
 */
export interface CheckpointClaim {
  date: string;
  goodPostureSeconds: number;
  longestFlowStreak: number;
  avgScore: number;
  level: number;
  xp: number;
  previousGoodPostureSeconds?: number | null;
  previousUpdatedAt?: string | null;
}

export type AntiCheatRule =
  | 'DATE_WINDOW'
  | 'DAILY_MAX'
  | 'ELAPSED_TODAY'
  | 'FLOW_VS_GOOD'
  | 'AVG_SCORE_RANGE'
  | 'LEVEL_XP_COHERENCE'
  | 'INCREMENT_VS_ELAPSED';

export type AntiCheatVerdict =
  | { ok: true }
  | { ok: false; rule: AntiCheatRule; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Umbral de XP (parte entera) para alcanzar `level`. */
function levelThreshold(level: number): number {
  return Math.floor(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

/** Instante (ms UTC) de las 00:00 del día `date` (`YYYY-MM-DD`). */
function utcMidnightMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

// ─── Reglas ───────────────────────────────────────────────────────────────────

function checkDateWindow(input: CheckpointClaim, receivedAtMs: number): AntiCheatVerdict {
  const inputMidnightMs = utcMidnightMs(input.date);
  const receivedDate = new Date(receivedAtMs);
  const receivedMidnightMs = Date.UTC(
    receivedDate.getUTCFullYear(),
    receivedDate.getUTCMonth(),
    receivedDate.getUTCDate(),
  );
  const diffDays = Math.abs(receivedMidnightMs - inputMidnightMs) / 86_400_000;

  if (diffDays > DATE_WINDOW_DAYS) {
    return {
      ok: false,
      rule: 'DATE_WINDOW',
      message: 'la fecha está fuera del plazo de escritura permitido',
    };
  }
  return { ok: true };
}

function checkDailyMax(input: CheckpointClaim): AntiCheatVerdict {
  if (input.goodPostureSeconds > MAX_DAILY_SECONDS) {
    return {
      ok: false,
      rule: 'DAILY_MAX',
      message: `goodPostureSeconds excede el máximo diario de ${MAX_DAILY_SECONDS}`,
    };
  }
  return { ok: true };
}

function checkElapsedToday(input: CheckpointClaim, receivedAtMs: number): AntiCheatVerdict {
  const elapsedSeconds = (receivedAtMs - utcMidnightMs(input.date)) / 1000;
  const maxAllowed = elapsedSeconds + TIMEZONE_SLACK_SECONDS;

  if (input.goodPostureSeconds > maxAllowed) {
    return {
      ok: false,
      rule: 'ELAPSED_TODAY',
      message: 'los segundos declarados exceden el tiempo transcurrido del día',
    };
  }
  return { ok: true };
}

function checkFlowVsGood(input: CheckpointClaim): AntiCheatVerdict {
  if (input.longestFlowStreak * 60 > input.goodPostureSeconds + FLOW_ROUNDING_SLACK_SECONDS) {
    return {
      ok: false,
      rule: 'FLOW_VS_GOOD',
      message: 'la racha de flow excede los segundos de buena postura',
    };
  }
  return { ok: true };
}

function checkAvgScoreRange(input: CheckpointClaim): AntiCheatVerdict {
  if (input.avgScore < 0 || input.avgScore > 100) {
    return {
      ok: false,
      rule: 'AVG_SCORE_RANGE',
      message: 'la puntuación media está fuera del rango de 0 a 100',
    };
  }
  return { ok: true };
}

function checkLevelXpCoherence(input: CheckpointClaim): AntiCheatVerdict {
  const { level, xp } = input;
  const isIncoherent =
    level < 1 ||
    xp < 0 ||
    xp >= levelThreshold(level) ||
    (level > 1 && xp < levelThreshold(level - 1));

  if (isIncoherent) {
    return {
      ok: false,
      rule: 'LEVEL_XP_COHERENCE',
      message: 'el nivel y el XP son incoherentes',
    };
  }
  return { ok: true };
}

function checkIncrementVsElapsed(input: CheckpointClaim, receivedAtMs: number): AntiCheatVerdict {
  const { previousGoodPostureSeconds, previousUpdatedAt } = input;

  if (
    previousGoodPostureSeconds === undefined ||
    previousGoodPostureSeconds === null ||
    !previousUpdatedAt
  ) {
    return { ok: true };
  }

  const increment = input.goodPostureSeconds - previousGoodPostureSeconds;
  if (increment <= 0) {
    return { ok: true };
  }

  const elapsedSeconds = (receivedAtMs - Date.parse(previousUpdatedAt)) / 1000;
  const maxAllowed = elapsedSeconds * TOLERANCE_FACTOR;

  if (increment > maxAllowed) {
    return {
      ok: false,
      rule: 'INCREMENT_VS_ELAPSED',
      message: 'el incremento excede el tiempo transcurrido permitido',
    };
  }
  return { ok: true };
}

// ─── Punto de entrada ─────────────────────────────────────────────────────────

/**
 * Evalúa las siete reglas anti-trampa en orden fijo. Las seis primeras solo
 * miran los valores declarados en la mutación, de modo que su resultado es
 * independiente de `previousGoodPostureSeconds` y `previousUpdatedAt`.
 * `INCREMENT_VS_ELAPSED` solo se evalúa si esos dos valores previos llegan.
 */
export function validateWrite(input: CheckpointClaim, receivedAtMs: number): AntiCheatVerdict {
  const checks = [
    checkDateWindow,
    checkDailyMax,
    checkElapsedToday,
    checkFlowVsGood,
    checkAvgScoreRange,
    checkLevelXpCoherence,
  ];

  for (const check of checks) {
    const verdict = check(input, receivedAtMs);
    if (!verdict.ok) {
      return verdict;
    }
  }

  return checkIncrementVsElapsed(input, receivedAtMs);
}
