import type { Landmark } from '../contracts/worker';
import type { CalibrationBaseline, PostureFrame } from '../contracts/posture';
import type { PostureState } from './stateMachine';
import { computeMetrics } from './metrics';
import { computeRawScore, applyEma } from './scoring';
import { transition } from './stateMachine';

/**
 * Orquesta el pipeline completo: landmarks → métricas → score → EMA → máquina de estados → PostureFrame.
 * Función pura: no DOM, no Date.now(), no efectos secundarios.
 */
export function processLandmarks(
  landmarks: Landmark[],
  baseline: CalibrationBaseline,
  prevState: PostureState,
  prevScore: number,
  now: number,
): { frame: PostureFrame; nextState: PostureState; smoothedScore: number } {
  // 1. Confidence = media de visibility de los 5 landmarks
  const confidence =
    landmarks.reduce((sum, lm) => sum + lm.visibility, 0) / landmarks.length;

  // 2. Métricas normalizadas contra baseline
  const metrics = computeMetrics(landmarks, baseline);

  // 3. Score bruto (0-100)
  const rawScore = computeRawScore(metrics);

  // 4. Suavizado EMA
  const smoothedScore = applyEma(prevScore, rawScore);

  // 5. Transición de la máquina de estados (usa score suavizado)
  const nextState = transition(prevState, smoothedScore, confidence, landmarks.length, now);

  // 6. Construir PostureFrame
  const frame: PostureFrame = {
    t: now,
    status: nextState.status,
    score: smoothedScore,
    metrics,
    confidence,
  };

  return { frame, nextState, smoothedScore };
}
