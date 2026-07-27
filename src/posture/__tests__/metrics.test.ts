import { describe, it, expect } from 'vitest';
import { computeRawMetrics, computeMetrics, computeNoseOffset } from '../metrics';
import type { Landmark } from '../../contracts/worker';
import type { CalibrationBaseline } from '../../contracts/posture';
import sessionGood from '../../../fixtures/session-good.json';

// Landmarks sintéticos con posición conocida para verificar las fórmulas
function makeLandmarks(overrides?: Partial<Record<'nose' | 'leftEar' | 'rightEar' | 'leftShoulder' | 'rightShoulder', Partial<Landmark>>>): Landmark[] {
  const defaults: Landmark[] = [
    { x: 0.5, y: 0.25, z: 0, visibility: 1 },   // NOSE
    { x: 0.45, y: 0.27, z: 0, visibility: 1 },   // LEFT_EAR
    { x: 0.55, y: 0.27, z: 0, visibility: 1 },   // RIGHT_EAR
    { x: 0.4, y: 0.45, z: 0, visibility: 1 },    // LEFT_SHOULDER
    { x: 0.6, y: 0.45, z: 0, visibility: 1 },    // RIGHT_SHOULDER
  ];
  if (overrides?.nose) Object.assign(defaults[0], overrides.nose);
  if (overrides?.leftEar) Object.assign(defaults[1], overrides.leftEar);
  if (overrides?.rightEar) Object.assign(defaults[2], overrides.rightEar);
  if (overrides?.leftShoulder) Object.assign(defaults[3], overrides.leftShoulder);
  if (overrides?.rightShoulder) Object.assign(defaults[4], overrides.rightShoulder);
  return defaults;
}

describe('computeRawMetrics', () => {
  it('calcula shoulderWidth como distancia horizontal entre hombros', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    // |0.6 - 0.4| = 0.2
    expect(raw.shoulderWidth).toBeCloseTo(0.2, 10);
  });

  it('calcula neckRatio = (midShouldersY - midEarsY) / shoulderWidth', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    // midShouldersY = (0.45 + 0.45) / 2 = 0.45
    // midEarsY = (0.27 + 0.27) / 2 = 0.27
    // neckRatio = (0.45 - 0.27) / 0.2 = 0.18 / 0.2 = 0.9
    expect(raw.neckRatio).toBeCloseTo(0.9, 10);
  });

  it('calcula tilt = atan2(yRight - yLeft, xRight - xLeft)', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    // atan2(0.45 - 0.45, 0.6 - 0.4) = atan2(0, 0.2) = 0
    expect(raw.tilt).toBeCloseTo(0, 10);
  });

  it('tilt es positivo cuando el hombro derecho está más bajo', () => {
    const landmarks = makeLandmarks({
      rightShoulder: { x: 0.6, y: 0.50 },
      leftShoulder: { x: 0.4, y: 0.45 },
    });
    const raw = computeRawMetrics(landmarks);
    // atan2(0.50 - 0.45, 0.6 - 0.4) = atan2(0.05, 0.2) > 0
    expect(raw.tilt).toBeGreaterThan(0);
  });

  it('calcula headTilt = (yNose - midEarsY) / shoulderWidth', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    // headTilt = (0.25 - 0.27) / 0.2 = -0.02 / 0.2 = -0.1
    expect(raw.headTilt).toBeCloseTo(-0.1, 10);
  });

  it('nunca usa la coordenada z: resultados idénticos con z distinto', () => {
    const landmarksA = makeLandmarks();
    const landmarksB = makeLandmarks();
    // Asignar z aleatorios a B
    landmarksB[0].z = 99;
    landmarksB[1].z = -42;
    landmarksB[2].z = 0.777;
    landmarksB[3].z = -1000;
    landmarksB[4].z = 3.14159;

    const rawA = computeRawMetrics(landmarksA);
    const rawB = computeRawMetrics(landmarksB);

    expect(rawA.shoulderWidth).toBe(rawB.shoulderWidth);
    expect(rawA.neckRatio).toBe(rawB.neckRatio);
    expect(rawA.tilt).toBe(rawB.tilt);
    expect(rawA.headTilt).toBe(rawB.headTilt);
  });
});

describe('computeNoseOffset', () => {
  it('es ~0 de frente (nariz centrada entre las orejas)', () => {
    // nose x=0.5, ears 0.45/0.55 → centrada
    expect(computeNoseOffset(makeLandmarks())).toBeCloseTo(0, 5);
  });

  it('crece al girar la cabeza (nariz descentrada, orejas juntas)', () => {
    const turned = makeLandmarks({
      nose: { x: 0.55 },
      leftEar: { x: 0.48 },
      rightEar: { x: 0.52 },
    });
    // |0.55 - 0.50| / |0.52 - 0.48| = 0.05 / 0.04 = 1.25
    expect(computeNoseOffset(turned)).toBeCloseTo(1.25, 5);
  });

  it('devuelve 1 si las orejas se alinean en x (perfil extremo)', () => {
    const profile = makeLandmarks({
      leftEar: { x: 0.5 },
      rightEar: { x: 0.5 },
    });
    expect(computeNoseOffset(profile)).toBe(1);
  });
});

describe('computeMetrics', () => {
  it('normaliza neckRatio dividiendo por baseline.neckRatio', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    const baseline: CalibrationBaseline = {
      shoulderWidth: raw.shoulderWidth,
      neckRatio: raw.neckRatio,
      tilt: raw.tilt,
      headTilt: raw.headTilt,
      capturedAt: 0,
    };

    const metrics = computeMetrics(landmarks, baseline);
    // Misma postura que calibración → ~1.0
    expect(metrics.neckRatio).toBeCloseTo(1.0, 10);
  });

  it('normaliza proximity = raw.shoulderWidth / baseline.shoulderWidth', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    const baseline: CalibrationBaseline = {
      shoulderWidth: raw.shoulderWidth * 0.5, // baseline la mitad → proximity = 2
      neckRatio: raw.neckRatio,
      tilt: raw.tilt,
      headTilt: raw.headTilt,
      capturedAt: 0,
    };

    const metrics = computeMetrics(landmarks, baseline);
    expect(metrics.proximity).toBeCloseTo(2.0, 10);
  });

  it('tilt se devuelve en radianes sin normalizar', () => {
    const landmarks = makeLandmarks({
      rightShoulder: { x: 0.6, y: 0.50 },
    });
    const raw = computeRawMetrics(landmarks);
    const baseline: CalibrationBaseline = {
      shoulderWidth: 0.2,
      neckRatio: 0.9,
      tilt: 0,
      headTilt: -0.1,
      capturedAt: 0,
    };

    const metrics = computeMetrics(landmarks, baseline);
    expect(metrics.tilt).toBe(raw.tilt);
  });

  it('normaliza headTilt dividiendo por baseline.headTilt', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    const baseline: CalibrationBaseline = {
      shoulderWidth: raw.shoulderWidth,
      neckRatio: raw.neckRatio,
      tilt: raw.tilt,
      headTilt: raw.headTilt * 2, // baseline el doble → headTilt normalizado = 0.5
      capturedAt: 0,
    };

    const metrics = computeMetrics(landmarks, baseline);
    expect(metrics.headTilt).toBeCloseTo(0.5, 10);
  });

  it('con la misma postura que la baseline todos los ratios son ~1', () => {
    const landmarks = makeLandmarks();
    const raw = computeRawMetrics(landmarks);
    const baseline: CalibrationBaseline = {
      shoulderWidth: raw.shoulderWidth,
      neckRatio: raw.neckRatio,
      tilt: raw.tilt,
      headTilt: raw.headTilt,
      capturedAt: 0,
    };

    const metrics = computeMetrics(landmarks, baseline);
    expect(metrics.neckRatio).toBeCloseTo(1.0, 5);
    expect(metrics.proximity).toBeCloseTo(1.0, 5);
    expect(metrics.headTilt).toBeCloseTo(1.0, 5);
    expect(metrics.tilt).toBeCloseTo(0, 5);
  });
});

describe('computeRawMetrics con datos de fixture', () => {
  it('produce valores realistas para el primer frame de session-good', () => {
    const frame = sessionGood.frames[0];
    const landmarks = frame.landmarks as Landmark[];
    const raw = computeRawMetrics(landmarks);

    // shoulderWidth razonable (hombros separados ~0.2 en coords normalizadas)
    expect(raw.shoulderWidth).toBeGreaterThan(0.1);
    expect(raw.shoulderWidth).toBeLessThan(0.5);

    // neckRatio positivo (hombros por debajo de orejas en coords MediaPipe)
    expect(raw.neckRatio).toBeGreaterThan(0.5);
    expect(raw.neckRatio).toBeLessThan(2.0);

    // tilt cercano a 0 (postura erguida, hombros nivelados)
    expect(Math.abs(raw.tilt)).toBeLessThan(0.1);

    // headTilt negativo o cercano a 0 (nariz por encima de orejas en Y de MediaPipe)
    expect(raw.headTilt).toBeGreaterThan(-0.5);
    expect(raw.headTilt).toBeLessThan(0.5);
  });

  it('valores son estables entre frames consecutivos de session-good', () => {
    const frames = sessionGood.frames.slice(0, 5);
    const raws = frames.map(f => computeRawMetrics(f.landmarks as Landmark[]));

    // shoulderWidth no varía más de 5% entre frames consecutivos
    for (let i = 1; i < raws.length; i++) {
      const diff = Math.abs(raws[i].shoulderWidth - raws[i - 1].shoulderWidth);
      expect(diff / raws[0].shoulderWidth).toBeLessThan(0.05);
    }
  });
});
