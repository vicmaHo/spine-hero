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
  // Inclinación de la línea de hombros respecto a la horizontal (0 = nivelados).
  // Usamos |dx| para que no dependa de qué hombro cae a menor x en la imagen:
  // con cámara real el hombro derecho está a menor x, y atan2(dy, dx<0) daría
  // ≈π incluso con hombros nivelados, hundiendo el score. Con |dx|, nivelado ≈ 0.
  const tilt = Math.atan2(
    rightShoulder.y - leftShoulder.y,
    Math.abs(rightShoulder.x - leftShoulder.x),
  );
  const headTilt = (nose.y - midEarsY) / shoulderWidth;

  return { shoulderWidth, neckRatio, tilt, headTilt };
}

/**
 * Desplazamiento horizontal de la nariz respecto al punto medio de las orejas,
 * normalizado por la distancia entre orejas. ~0 de frente; crece al girar la
 * cabeza (de perfil las orejas se juntan en x y la nariz se descentra). Sirve
 * como detector de orientación: girado, las métricas 2D no son fiables porque
 * MediaPipe alucina de forma estable el lado ocluido (la visibility no lo delata).
 */
export function computeNoseOffset(landmarks: Landmark[]): number {
  const nose = landmarks[IDX_NOSE];
  const leftEar = landmarks[IDX_LEFT_EAR];
  const rightEar = landmarks[IDX_RIGHT_EAR];
  const earMidX = (leftEar.x + rightEar.x) / 2;
  const earWidth = Math.abs(rightEar.x - leftEar.x);
  if (earWidth < 1e-4) return 1; // orejas alineadas en x → claramente de perfil
  return Math.abs(nose.x - earMidX) / earWidth;
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
