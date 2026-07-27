import type { PostureMetrics } from '../contracts/posture';

// Pesos de cada métrica en el score final
export const WEIGHT_NECK_RATIO = 0.40;
export const WEIGHT_TILT = 0.20;
export const WEIGHT_HEAD_TILT = 0.20;
export const WEIGHT_PROXIMITY = 0.20;

// Factor de suavizado EMA. Más alto = el score (y el color de la barra) reacciona
// más rápido a los cambios de postura, a costa de algo más de nerviosismo.
// A 5 FPS: 0.3 tardaba ~2 s en virar; 0.4 lo baja a ~1.3 s.
export const EMA_ALPHA = 0.4;

// Factores de escala para convertir desviación en penalización (0-100 por métrica).
// Elegidos empíricamente para que:
// - Desviaciones pequeñas (<0.1 para ratios, <0.1 rad para tilt) penalicen poco
// - Desviaciones grandes (neckRatio ~0.5 → desviación 0.5) penalicen mucho
const SCALE_NECK_RATIO = 500;
const SCALE_TILT = 200;
const SCALE_HEAD_TILT = 200;
const SCALE_PROXIMITY = 60;

// Zona muerta: desviaciones menores a este umbral no penalizan (tolerancia al ruido)
const DEAD_ZONE = 0.05;

/**
 * Calcula la penalización de una métrica individual.
 * Usa una zona muerta para tolerar ruido y escala cuadráticamente para
 * penalizar desviaciones grandes mucho más que las pequeñas.
 */
function penalty(deviation: number, scale: number): number {
  const abs = Math.abs(deviation);
  const effective = Math.max(0, abs - DEAD_ZONE);
  // Penalización cuadrática: desviaciones grandes duelen mucho más
  return scale * effective * effective;
}

/**
 * Score bruto de postura (0-100).
 * Postura perfecta (neckRatio=1, proximity=1, headTilt=1, tilt=0) → 100.
 * Cuanto mayor la desviación, menor el score.
 */
export function computeRawScore(metrics: PostureMetrics): number {
  const deviationNeck = 1 - metrics.neckRatio;      // ideal = 1
  const deviationTilt = metrics.tilt;                // ideal = 0
  const deviationHead = 1 - metrics.headTilt;        // ideal = 1
  const deviationProx = metrics.proximity - 1;       // ideal = 1

  const totalPenalty =
    WEIGHT_NECK_RATIO * penalty(deviationNeck, SCALE_NECK_RATIO) +
    WEIGHT_TILT * penalty(deviationTilt, SCALE_TILT) +
    WEIGHT_HEAD_TILT * penalty(deviationHead, SCALE_HEAD_TILT) +
    WEIGHT_PROXIMITY * penalty(deviationProx, SCALE_PROXIMITY);

  // Clamp a [0, 100]
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

/**
 * Media móvil exponencial (EMA).
 * smoothed = alpha * current + (1 - alpha) * prev
 */
export function applyEma(prev: number, current: number, alpha: number = EMA_ALPHA): number {
  return alpha * current + (1 - alpha) * prev;
}
