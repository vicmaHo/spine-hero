import type { Landmark } from '../contracts/worker';
import type { CalibrationBaseline, PostureFrame } from '../contracts/posture';
import type { PostureState } from './stateMachine';
import { computeMetrics, computeNoseOffset, IDX_LEFT_SHOULDER, IDX_RIGHT_SHOULDER } from './metrics';
import { computeRawScore, applyEma } from './scoring';
import { transition, MIN_CONFIDENCE } from './stateMachine';

/**
 * Ancho de hombros mínimo (en coords normalizadas 0-1) para considerar la
 * geometría utilizable. Por debajo de esto (glitch de landmarks o usuario de
 * perfil) todo lo que se normaliza por shoulderWidth daría Infinity/NaN, o un 0
 * espurio que arrastraría el EMA. El valor típico erguido ronda 0.2, así que
 * este umbral solo dispara ante geometría realmente degenerada.
 */
export const MIN_SHOULDER_WIDTH = 0.02;

/**
 * Umbral de desplazamiento de la nariz por encima del cual consideramos que el
 * usuario no está de frente (cabeza girada o cámara lateral). Empírico: en
 * capturas reales daba ~0.15 de frente y ~0.70 de lado. Girado, las métricas 2D
 * no son fiables, así que congelamos y dejamos que la máquina de estados vaya a
 * LOW_CONF (su debounce de 1 s filtra vistazos momentáneos).
 */
export const ORIENTATION_MAX_NOSE_OFFSET = 0.4;

/**
 * Frame "congelado": mantiene el score previo y deja que la máquina de estados
 * decida el status. Se usa cuando no hay señal utilizable (sin 5 landmarks o
 * geometría degenerada) para no contaminar el EMA con valores no finitos.
 */
function frozenFrame(
  prevState: PostureState,
  prevScore: number,
  confidence: number,
  landmarkCount: number,
  now: number,
): { frame: PostureFrame; nextState: PostureState; smoothedScore: number } {
  const nextState = transition(prevState, prevScore, confidence, landmarkCount, now);
  return {
    frame: {
      t: now,
      status: nextState.status,
      score: prevScore,
      metrics: { neckRatio: 0, proximity: 0, tilt: 0, headTilt: 0 },
      confidence,
    },
    nextState,
    smoothedScore: prevScore,
  };
}

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
  // 1. Confidence = media de visibility de los 5 landmarks (0 si no hay pose)
  const confidence =
    landmarks.length > 0
      ? landmarks.reduce((sum, lm) => sum + lm.visibility, 0) / landmarks.length
      : 0;

  // Sin los 5 landmarks no se pueden calcular métricas: computeRawMetrics leería
  // undefined y lanzaría. La máquina de estados decide AWAY por landmarks.length.
  if (landmarks.length < 5) {
    return frozenFrame(prevState, prevScore, confidence, landmarks.length, now);
  }

  // Frame poco fiable (baja visibilidad): no movemos el score con datos malos,
  // que si no se desploma la barra mientras el usuario está fuera de cuadro. La
  // máquina de estados decide LOW_CONF/AWAY con la confianza real.
  if (confidence < MIN_CONFIDENCE) {
    return frozenFrame(prevState, prevScore, confidence, landmarks.length, now);
  }

  // Guarda de geometría degenerada: todo se normaliza por shoulderWidth, así que
  // un ancho ≈ 0 (glitch o usuario de perfil) daría métricas no finitas que
  // envenenarían el EMA de toda la sesión, o un 0 espurio que penalizaría sin
  // motivo. Lo tratamos como señal no fiable (confidence 0 → LOW_CONF).
  const shoulderWidth = Math.abs(
    landmarks[IDX_RIGHT_SHOULDER].x - landmarks[IDX_LEFT_SHOULDER].x,
  );
  if (shoulderWidth < MIN_SHOULDER_WIDTH) {
    return frozenFrame(prevState, prevScore, 0, landmarks.length, now);
  }

  // Guarda de orientación: si la cabeza está girada / cámara lateral, las
  // métricas 2D miden mal (MediaPipe alucina el lado ocluido y la visibility no
  // baja). Congelamos con confidence 0 → LOW_CONF tras el debounce de 1 s.
  if (computeNoseOffset(landmarks) > ORIENTATION_MAX_NOSE_OFFSET) {
    return frozenFrame(prevState, prevScore, 0, landmarks.length, now);
  }

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
