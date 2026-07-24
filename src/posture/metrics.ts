import type { Landmark } from '../contracts/worker';
import type { CalibrationBaseline, PostureMetrics } from '../contracts/posture';

// Índices de los landmarks en el array de 5 elementos que recibimos
export const IDX_NOSE = 0;
export const IDX_LEFT_EAR = 1;
export const IDX_RIGHT_EAR = 2;
export const IDX_LEFT_SHOULDER = 3;
export const IDX_RIGHT_SHOULDER = 4;

/**
 * Calcula las métricas crudas (sin normalizar contra baseline).
 * Usada durante calibración para obtener los valores de referencia.
 *
 * @param landmarks - Array de 5 landmarks: [NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER]
 */
export function computeRawMetrics(landmarks: Landmark[]): {
  shoulderWidth: number;
  neckRatio: number;
  tilt: number;
  headTilt: number;
} {
  const nose = landmarks[IDX_NOSE];
  const leftEar = landmarks[IDX_LEFT_EAR];
  const rightEar = landmarks[IDX_RIGHT_EAR];
  const leftShoulder = landmarks[IDX_LEFT_SHOULDER];
  const rightShoulder = landmarks[IDX_RIGHT_SHOULDER];

  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);

  const midEarsY = (leftEar.y + rightEar.y) / 2;
  const midShouldersY = (leftShoulder.y + rightShoulder.y) / 2;

  const neckRatio = (midShouldersY - midEarsY) / shoulderWidth;
  const tilt = Math.atan2(
    rightShoulder.y - leftShoulder.y,
    rightShoulder.x - leftShoulder.x,
  );
  const headTilt = (nose.y - midEarsY) / shoulderWidth;

  return { shoulderWidth, neckRatio, tilt, headTilt };
}

/**
 * Calcula las métricas normalizadas contra la baseline de calibración.
 * neckRatio y headTilt se dividen por su valor de calibración (~1.0 = postura igual).
 * proximity se divide por shoulderWidth de calibración (>1 = más cerca).
 * tilt se devuelve en radianes absolutos.
 */
export function computeMetrics(
  landmarks: Landmark[],
  baseline: CalibrationBaseline,
): PostureMetrics {
  const raw = computeRawMetrics(landmarks);

  return {
    neckRatio: raw.neckRatio / baseline.neckRatio,
    proximity: raw.shoulderWidth / baseline.shoulderWidth,
    tilt: raw.tilt,
    headTilt: raw.headTilt / baseline.headTilt,
  };
}
