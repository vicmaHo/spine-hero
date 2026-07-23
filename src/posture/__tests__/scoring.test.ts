import { describe, it, expect } from 'vitest';
import {
  computeRawScore,
  applyEma,
  WEIGHT_NECK_RATIO,
  WEIGHT_TILT,
  WEIGHT_HEAD_TILT,
  WEIGHT_PROXIMITY,
  EMA_ALPHA,
} from '../scoring';
import type { PostureMetrics } from '../../contracts/posture';

describe('scoring – constantes exportadas', () => {
  it('los pesos suman 1.0', () => {
    const sum = WEIGHT_NECK_RATIO + WEIGHT_TILT + WEIGHT_HEAD_TILT + WEIGHT_PROXIMITY;
    expect(sum).toBeCloseTo(1.0);
  });

  it('EMA_ALPHA es 0.3', () => {
    expect(EMA_ALPHA).toBe(0.3);
  });
});

describe('computeRawScore', () => {
  const perfect: PostureMetrics = {
    neckRatio: 1,
    proximity: 1,
    tilt: 0,
    headTilt: 1,
  };

  it('postura perfecta → score = 100', () => {
    expect(computeRawScore(perfect)).toBe(100);
  });

  it('encorvado (neckRatio=0.5) → score < 60', () => {
    const slouched: PostureMetrics = {
      neckRatio: 0.5,
      proximity: 1,
      tilt: 0,
      headTilt: 1,
    };
    expect(computeRawScore(slouched)).toBeLessThan(60);
  });

  it('desviaciones leves → score > 80 (tolerancia al ruido)', () => {
    const slight: PostureMetrics = {
      neckRatio: 0.95,
      proximity: 1.05,
      tilt: 0.03,
      headTilt: 0.95,
    };
    expect(computeRawScore(slight)).toBeGreaterThan(80);
  });

  it('solo proximity aumentada (1.5) con neckRatio perfecto → score > 75', () => {
    const leanForward: PostureMetrics = {
      neckRatio: 1,
      proximity: 1.5,
      tilt: 0,
      headTilt: 1,
    };
    expect(computeRawScore(leanForward)).toBeGreaterThan(75);
  });

  it('métricas extremas → score clamped a [0, 100]', () => {
    const extreme: PostureMetrics = {
      neckRatio: 0.1,
      proximity: 3,
      tilt: 1.5,
      headTilt: 0.1,
    };
    const score = computeRawScore(extreme);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('applyEma', () => {
  it('converge hacia el valor actual con llamadas sucesivas', () => {
    let smoothed = 50;
    for (let i = 0; i < 20; i++) {
      smoothed = applyEma(smoothed, 100);
    }
    // Después de 20 iteraciones con alpha=0.3, debe estar muy cerca de 100
    expect(smoothed).toBeGreaterThan(99);
  });

  it('alpha=1 → valor actual inmediatamente', () => {
    expect(applyEma(50, 80, 1)).toBe(80);
  });

  it('alpha=0 → valor previo sin cambios', () => {
    expect(applyEma(50, 80, 0)).toBe(50);
  });
});
