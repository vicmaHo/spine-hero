import type {
  PostureSource,
  PostureFrame,
  PostureStatus,
  PostureMetrics,
  CalibrationBaseline,
} from './posture';

// --- Duración de cada fase del guion (ms) ---
const GOOD_MS = 30_000;
const TRANSITION_DOWN_MS = 5_000;
const BAD_MS = 20_000;
const TRANSITION_UP_MS = 5_000;
const AWAY_MS = 10_000;
const CYCLE_MS = GOOD_MS + TRANSITION_DOWN_MS + BAD_MS + TRANSITION_UP_MS + AWAY_MS;

const TICK_MS = 200;

// --- Rangos de score por estado ---
const GOOD_MIN = 85;
const GOOD_MAX = 95;
const BAD_MIN = 35;
const BAD_MAX = 55;

/**
 * Interpola linealmente entre a y b según t ∈ [0, 1].
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Genera métricas coherentes con el score dado.
 * Cuanto peor el score, peores las métricas respecto a la baseline.
 */
function metricsForScore(score: number): PostureMetrics {
  // score 100 → neckRatio ~1.0, score 0 → neckRatio ~0.6
  const neckRatio = lerp(0.6, 1.0, score / 100);
  // score 100 → proximity ~1.0, score 0 → proximity ~1.4
  const proximity = lerp(1.4, 1.0, score / 100);
  // score 100 → tilt ~0, score 0 → tilt ~0.2 rad
  const tilt = lerp(0.2, 0, score / 100);
  // score 100 → headTilt ~0, score 0 → headTilt ~0.15
  const headTilt = lerp(0.15, 0, score / 100);

  return { neckRatio, proximity, tilt, headTilt };
}

interface PhaseResult {
  status: PostureStatus;
  score: number;
  confidence: number;
}

/**
 * Determina el estado y score para un instante dado del ciclo.
 */
function resolvePhase(elapsedInCycle: number): PhaseResult {
  let cursor = 0;

  // Fase GOOD
  cursor += GOOD_MS;
  if (elapsedInCycle < cursor) {
    const progress = (elapsedInCycle - (cursor - GOOD_MS)) / GOOD_MS;
    // Oscila suavemente entre GOOD_MIN y GOOD_MAX
    const score = lerp(GOOD_MIN, GOOD_MAX, 0.5 + 0.5 * Math.sin(progress * Math.PI * 2));
    return { status: 'GOOD', score, confidence: 0.95 };
  }

  // Transición descendente (GOOD → BAD)
  cursor += TRANSITION_DOWN_MS;
  if (elapsedInCycle < cursor) {
    const progress = (elapsedInCycle - (cursor - TRANSITION_DOWN_MS)) / TRANSITION_DOWN_MS;
    const score = lerp(GOOD_MIN, BAD_MAX, progress);
    // Durante la transición, el estado cambia a BAD cuando cruza el punto medio
    const status: PostureStatus = progress < 0.5 ? 'GOOD' : 'BAD';
    return { status, score, confidence: 0.9 };
  }

  // Fase BAD
  cursor += BAD_MS;
  if (elapsedInCycle < cursor) {
    const progress = (elapsedInCycle - (cursor - BAD_MS)) / BAD_MS;
    const score = lerp(BAD_MIN, BAD_MAX, 0.5 + 0.5 * Math.sin(progress * Math.PI * 2));
    return { status: 'BAD', score, confidence: 0.9 };
  }

  // Transición ascendente (BAD → GOOD)
  cursor += TRANSITION_UP_MS;
  if (elapsedInCycle < cursor) {
    const progress = (elapsedInCycle - (cursor - TRANSITION_UP_MS)) / TRANSITION_UP_MS;
    const score = lerp(BAD_MAX, GOOD_MIN, progress);
    const status: PostureStatus = progress < 0.5 ? 'BAD' : 'GOOD';
    return { status, score, confidence: 0.9 };
  }

  // Fase AWAY
  return { status: 'AWAY', score: 0, confidence: 0 };
}

/**
 * Crea un PostureSource ficticio con un guion cíclico predecible.
 * Útil para desarrollo y pruebas sin cámara.
 */
export function createMockPostureSource(): PostureSource {
  const subscribers = new Set<(frame: PostureFrame) => void>();
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;

  function emit(now: number): void {
    const elapsed = now - startTime;
    const elapsedInCycle = elapsed % CYCLE_MS;
    const { status, score, confidence } = resolvePhase(elapsedInCycle);
    const metrics = status === 'AWAY'
      ? { neckRatio: 0, proximity: 0, tilt: 0, headTilt: 0 }
      : metricsForScore(score);

    const frame: PostureFrame = {
      t: now,
      status,
      score,
      metrics,
      confidence,
    };

    for (const fn of subscribers) {
      fn(frame);
    }
  }

  return {
    start() {
      startTime = Date.now();
      intervalId = setInterval(() => emit(Date.now()), TICK_MS);
      return Promise.resolve();
    },

    stop() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    calibrate() {
      return new Promise<CalibrationBaseline>((resolve) => {
        setTimeout(() => {
          resolve({
            shoulderWidth: 0.35,
            neckRatio: 0.95,
            tilt: 0.02,
            headTilt: 0.01,
            capturedAt: Date.now(),
          });
        }, 2_000);
      });
    },

    subscribe(fn: (frame: PostureFrame) => void) {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
  };
}
