import { describe, it, expect } from 'vitest';
import type { Landmark } from '../../contracts/worker';
import {
  createCalibrationCollector,
  CALIBRATION_DURATION_MS,
  MIN_VALID_FRAMES,
} from '../calibration';
import fixtureGood from '../../../fixtures/session-good.json';

// Helper: genera un landmark con valores controlados
function makeLandmark(x: number, y: number, visibility = 0.95): Landmark {
  return { x, y, z: 0, visibility };
}

// Landmarks "erguidos" consistentes para tests deterministas
// [NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER]
function makeGoodLandmarks(): Landmark[] {
  return [
    makeLandmark(0.5, 0.25),   // nose
    makeLandmark(0.46, 0.27),  // left ear
    makeLandmark(0.54, 0.27),  // right ear
    makeLandmark(0.4, 0.45),   // left shoulder
    makeLandmark(0.6, 0.45),   // right shoulder
  ];
}

describe('calibration', () => {
  it('acumula frames y reporta validCount correcto', () => {
    const collector = createCalibrationCollector(0);
    const landmarks = makeGoodLandmarks();

    collector.push(landmarks, 0.9, 100);
    collector.push(landmarks, 0.8, 200);
    collector.push(landmarks, 0.95, 300);

    expect(collector.validCount).toBe(3);
  });

  it('descarta frames con confidence < 0.7', () => {
    const collector = createCalibrationCollector(0);
    const landmarks = makeGoodLandmarks();

    collector.push(landmarks, 0.9, 100);   // válido
    collector.push(landmarks, 0.5, 200);   // descartado
    collector.push(landmarks, 0.69, 300);  // descartado
    collector.push(landmarks, 0.7, 400);   // válido (exactamente 0.7)
    collector.push(landmarks, 0.1, 500);   // descartado

    expect(collector.validCount).toBe(2);
  });

  it('isComplete devuelve false antes de 5s y true después', () => {
    const startTime = 1000;
    const collector = createCalibrationCollector(startTime);

    expect(collector.isComplete(startTime)).toBe(false);
    expect(collector.isComplete(startTime + 4999)).toBe(false);
    expect(collector.isComplete(startTime + CALIBRATION_DURATION_MS)).toBe(true);
    expect(collector.isComplete(startTime + 6000)).toBe(true);
  });

  it('isValid devuelve false con < 15 frames y true con >= 15', () => {
    const collector = createCalibrationCollector(0);
    const landmarks = makeGoodLandmarks();

    for (let i = 0; i < MIN_VALID_FRAMES - 1; i++) {
      collector.push(landmarks, 0.9, i * 200);
    }
    expect(collector.isValid()).toBe(false);

    collector.push(landmarks, 0.9, 3000);
    expect(collector.isValid()).toBe(true);
  });

  it('compute() devuelve la mediana de las métricas (número impar de frames)', () => {
    const collector = createCalibrationCollector(0);

    // Generamos 15 frames con shoulderWidth variable para verificar mediana
    // shoulderWidth = |rightShoulder.x - leftShoulder.x|
    // Usamos valores que produzcan shoulderWidths conocidos: 0.18, 0.19, ..., 0.32
    for (let i = 0; i < 15; i++) {
      const sw = 0.18 + i * 0.01; // 0.18..0.32
      const landmarks: Landmark[] = [
        makeLandmark(0.5, 0.25),         // nose
        makeLandmark(0.46, 0.27),        // left ear
        makeLandmark(0.54, 0.27),        // right ear
        makeLandmark(0.5 - sw / 2, 0.45), // left shoulder
        makeLandmark(0.5 + sw / 2, 0.45), // right shoulder
      ];
      collector.push(landmarks, 0.9, i * 200);
    }

    const baseline = collector.compute();
    // Mediana de 15 valores (índice 7): shoulderWidth = 0.25
    expect(baseline.shoulderWidth).toBeCloseTo(0.25, 5);
  });

  it('compute() devuelve la mediana correcta para número par de frames', () => {
    const collector = createCalibrationCollector(0);

    // 16 frames con shoulderWidth: 0.18..0.33
    for (let i = 0; i < 16; i++) {
      const sw = 0.18 + i * 0.01;
      const landmarks: Landmark[] = [
        makeLandmark(0.5, 0.25),
        makeLandmark(0.46, 0.27),
        makeLandmark(0.54, 0.27),
        makeLandmark(0.5 - sw / 2, 0.45),
        makeLandmark(0.5 + sw / 2, 0.45),
      ];
      collector.push(landmarks, 0.9, i * 200);
    }

    const baseline = collector.compute();
    // Mediana de 16 valores: promedio de índices 7 y 8 → (0.25 + 0.26) / 2 = 0.255
    expect(baseline.shoulderWidth).toBeCloseTo(0.255, 5);
  });

  it('compute() lanza error si < 15 frames válidos', () => {
    const collector = createCalibrationCollector(0);
    const landmarks = makeGoodLandmarks();

    for (let i = 0; i < 10; i++) {
      collector.push(landmarks, 0.9, i * 200);
    }

    expect(() => collector.compute()).toThrow();
  });

  it('capturedAt se establece con startTime', () => {
    const startTime = 42000;
    const collector = createCalibrationCollector(startTime);
    const landmarks = makeGoodLandmarks();

    for (let i = 0; i < MIN_VALID_FRAMES; i++) {
      collector.push(landmarks, 0.9, startTime + i * 200);
    }

    const baseline = collector.compute();
    expect(baseline.capturedAt).toBe(startTime);
  });

  it('funciona con datos del fixture session-good.json (primeros 25 frames)', () => {
    const first25 = fixtureGood.frames.slice(0, 25);
    const startTime = first25[0].t;
    const collector = createCalibrationCollector(startTime);

    for (const frame of first25) {
      const landmarks = frame.landmarks as Landmark[];
      // Confidence = media de visibility de los 5 landmarks
      const confidence =
        landmarks.reduce((sum, lm) => sum + lm.visibility, 0) / landmarks.length;
      collector.push(landmarks, confidence, frame.t);
    }

    // Los frames del fixture tienen visibility alta (~0.95), todos deberían pasar
    expect(collector.validCount).toBe(25);
    expect(collector.isValid()).toBe(true);

    const baseline = collector.compute();
    expect(baseline.capturedAt).toBe(startTime);
    // shoulderWidth debería ser ~0.2 (valores típicos del fixture)
    expect(baseline.shoulderWidth).toBeGreaterThan(0.1);
    expect(baseline.shoulderWidth).toBeLessThan(0.4);
    // neckRatio positivo (hombros por debajo de orejas en coordenadas y)
    expect(baseline.neckRatio).toBeGreaterThan(0);
    // headTilt: nose está por debajo de midEars normalmente → negativo o cercano a 0
    expect(baseline.headTilt).toBeDefined();
    expect(baseline.tilt).toBeDefined();
  });
});
