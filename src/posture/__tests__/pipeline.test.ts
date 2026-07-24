import { describe, it, expect } from 'vitest';
import { processLandmarks } from '../pipeline';
import { applyEma } from '../scoring';
import { INITIAL_POSTURE_STATE, DEBOUNCE_BAD_MS, DEBOUNCE_GOOD_MS } from '../stateMachine';
import type { Landmark } from '../../contracts/worker';
import type { CalibrationBaseline } from '../../contracts/posture';
import type { PostureState } from '../stateMachine';

// Landmarks de postura perfecta (iguales a la calibración)
function perfectLandmarks(): Landmark[] {
  return [
    { x: 0.5, y: 0.3, z: 0, visibility: 0.95 },  // NOSE
    { x: 0.45, y: 0.25, z: 0, visibility: 0.9 },  // LEFT_EAR
    { x: 0.55, y: 0.25, z: 0, visibility: 0.9 },  // RIGHT_EAR
    { x: 0.35, y: 0.5, z: 0, visibility: 0.95 },  // LEFT_SHOULDER
    { x: 0.65, y: 0.5, z: 0, visibility: 0.95 },  // RIGHT_SHOULDER
  ];
}

// Landmarks encorvados: orejas y nariz bajan mucho (neckRatio se reduce)
function slouchedLandmarks(): Landmark[] {
  return [
    { x: 0.5, y: 0.44, z: 0, visibility: 0.9 },   // NOSE (baja mucho)
    { x: 0.45, y: 0.42, z: 0, visibility: 0.9 },   // LEFT_EAR (baja)
    { x: 0.55, y: 0.42, z: 0, visibility: 0.9 },   // RIGHT_EAR (baja)
    { x: 0.35, y: 0.5, z: 0, visibility: 0.95 },   // LEFT_SHOULDER
    { x: 0.65, y: 0.5, z: 0, visibility: 0.95 },   // RIGHT_SHOULDER
  ];
}

// Baseline calibrada con los landmarks perfectos
function makeBaseline(): CalibrationBaseline {
  // shoulderWidth = |0.65 - 0.35| = 0.3
  // midEarsY = (0.25 + 0.25) / 2 = 0.25
  // midShouldersY = (0.5 + 0.5) / 2 = 0.5
  // neckRatio = (0.5 - 0.25) / 0.3 = 0.8333
  // headTilt = (0.3 - 0.25) / 0.3 = 0.1667
  return {
    shoulderWidth: 0.3,
    neckRatio: (0.5 - 0.25) / 0.3,
    tilt: 0,
    headTilt: (0.3 - 0.25) / 0.3,
    capturedAt: 1000,
  };
}

describe('processLandmarks', () => {
  const baseline = makeBaseline();

  it('postura perfecta → frame con score alto y status GOOD', () => {
    const { frame, nextState, smoothedScore } = processLandmarks(
      perfectLandmarks(),
      baseline,
      INITIAL_POSTURE_STATE,
      100, // prevScore alto (como si ya estuviera en GOOD)
      5000,
    );

    expect(frame.score).toBeGreaterThan(80);
    expect(frame.status).toBe('GOOD');
    expect(nextState.status).toBe('GOOD');
    expect(smoothedScore).toBeGreaterThan(80);
  });

  it('smoothedScore retornado coincide con el cálculo EMA', () => {
    const prevScore = 80;
    const { smoothedScore } = processLandmarks(
      perfectLandmarks(),
      baseline,
      INITIAL_POSTURE_STATE,
      prevScore,
      5000,
    );

    // El rawScore para landmarks perfectos es 100
    // EMA: 0.3 * 100 + 0.7 * 80 = 86
    const expectedEma = applyEma(prevScore, 100);
    expect(smoothedScore).toBeCloseTo(expectedEma);
  });

  it('nextState refleja la salida de la máquina de estados', () => {
    // Empezamos en GOOD con score bajo sostenido → debería marcar pendingTarget BAD
    const lowScoreState: PostureState = {
      status: 'GOOD',
      lastStableStatus: 'GOOD',
      pendingSince: 1000,
      pendingTarget: 'BAD',
    };

    const { nextState } = processLandmarks(
      slouchedLandmarks(),
      baseline,
      lowScoreState,
      30, // prevScore bajo para que EMA siga bajo
      5000,
    );

    // El score suavizado sigue siendo bajo → la máquina mantiene el pending
    expect(nextState.pendingTarget).toBe('BAD');
  });

  it('confidence se calcula como media de visibilities', () => {
    const landmarks = perfectLandmarks();
    // visibilities: 0.95, 0.9, 0.9, 0.95, 0.95
    const expectedConfidence = (0.95 + 0.9 + 0.9 + 0.95 + 0.95) / 5;

    const { frame } = processLandmarks(
      landmarks,
      baseline,
      INITIAL_POSTURE_STATE,
      100,
      5000,
    );

    expect(frame.confidence).toBeCloseTo(expectedConfidence);
  });

  it('PostureFrame tiene el timestamp correcto', () => {
    const now = 123456;
    const { frame } = processLandmarks(
      perfectLandmarks(),
      baseline,
      INITIAL_POSTURE_STATE,
      100,
      now,
    );

    expect(frame.t).toBe(now);
  });

  it('sesión secuencial: transiciones respetan debounce', () => {
    const frameInterval = 200; // 5 FPS
    let state: PostureState = INITIAL_POSTURE_STATE;
    let score = 100;
    let now = 0;

    // Fase 1: 10 s de postura perfecta → permanece GOOD
    for (let i = 0; i < 50; i++) {
      now += frameInterval;
      const result = processLandmarks(perfectLandmarks(), baseline, state, score, now);
      state = result.nextState;
      score = result.smoothedScore;
    }
    expect(state.status).toBe('GOOD');

    // Fase 2: cambio a postura encorvada
    // Primero dejamos que el EMA baje (el score empieza alto)
    // Necesitamos que baje de 60 primero, y luego 8 s de debounce
    const slouchStart = now;

    // Enviar frames encorvados hasta que el EMA baje a < 60
    while (score >= 60 || now - slouchStart < DEBOUNCE_BAD_MS + 1000) {
      now += frameInterval;
      const result = processLandmarks(slouchedLandmarks(), baseline, state, score, now);
      state = result.nextState;
      score = result.smoothedScore;

      // Evitar loop infinito en caso de error
      if (now - slouchStart > 30000) break;
    }

    // Después de suficiente tiempo encorvado, debería haber transitado a BAD
    expect(state.status).toBe('BAD');

    // Fase 3: vuelve a postura perfecta → necesita 3 s de debounce para GOOD
    const goodStart = now;

    // Subir el score con postura perfecta
    while (state.status !== 'GOOD') {
      now += frameInterval;
      const result = processLandmarks(perfectLandmarks(), baseline, state, score, now);
      state = result.nextState;
      score = result.smoothedScore;

      // Evitar loop infinito
      if (now - goodStart > 20000) break;
    }

    expect(state.status).toBe('GOOD');
    // La transición BAD→GOOD debió tomar al menos DEBOUNCE_GOOD_MS después de que score > 75
    expect(now - goodStart).toBeGreaterThanOrEqual(DEBOUNCE_GOOD_MS);
  });
});
