import { describe, it, expect } from 'vitest';
import {
  computeHealth,
  formatBenchmarkMarkdown,
  EMPTY_SNAPSHOT,
  HEALTH_THRESHOLDS,
  type PerfSnapshot,
} from '../perfSnapshot';

function snap(overrides: Partial<PerfSnapshot>): PerfSnapshot {
  return { ...EMPTY_SNAPSHOT, ...overrides };
}

describe('computeHealth', () => {
  it('IDLE cuando no hay ninguna medición', () => {
    expect(computeHealth(EMPTY_SNAPSHOT)).toBe('IDLE');
  });

  it('HEALTHY con FPS alto, p95 bajo y sin descartes', () => {
    expect(computeHealth(snap({ fps: 5, p95: 18, droppedDelta: 0 }))).toBe('HEALTHY');
  });

  it('WARNING cuando FPS está entre 3.0 y 4.4', () => {
    expect(computeHealth(snap({ fps: 4.0, p95: 15 }))).toBe('WARNING');
    expect(computeHealth(snap({ fps: 3.0, p95: 15 }))).toBe('WARNING');
  });

  it('WARNING cuando p95 supera 25ms aunque el FPS sea bueno', () => {
    expect(computeHealth(snap({ fps: 5, p95: 30 }))).toBe('WARNING');
  });

  it('WARNING cuando los descartes por sondeo superan el umbral suave', () => {
    expect(computeHealth(snap({ fps: 5, p95: 15, droppedDelta: 3 }))).toBe('WARNING');
  });

  it('CRITICAL cuando FPS cae por debajo de 3.0', () => {
    expect(computeHealth(snap({ fps: 2.5, p95: 15 }))).toBe('CRITICAL');
  });

  it('CRITICAL ante subida rápida de frames descartados', () => {
    expect(computeHealth(snap({ fps: 5, p95: 15, droppedDelta: 6 }))).toBe('CRITICAL');
  });

  describe('fronteras exactas', () => {
    it('FPS = 4.5 exacto es HEALTHY', () => {
      expect(computeHealth(snap({ fps: HEALTH_THRESHOLDS.FPS_HEALTHY, p95: 10 }))).toBe('HEALTHY');
    });

    it('p95 = 25 exacto es HEALTHY (el límite no penaliza)', () => {
      expect(computeHealth(snap({ fps: 5, p95: HEALTH_THRESHOLDS.P95_MAX_MS }))).toBe('HEALTHY');
    });

    it('droppedDelta = 2 exacto es HEALTHY', () => {
      expect(
        computeHealth(snap({ fps: 5, p95: 10, droppedDelta: HEALTH_THRESHOLDS.DROPPED_DELTA_WARN })),
      ).toBe('HEALTHY');
    });

    it('droppedDelta = 5 exacto es CRITICAL', () => {
      expect(
        computeHealth(snap({ fps: 5, p95: 10, droppedDelta: HEALTH_THRESHOLDS.DROPPED_DELTA_CRITICAL })),
      ).toBe('CRITICAL');
    });

    it('FPS = 0 tras haber corrido (p95 > 0) es CRITICAL, no IDLE', () => {
      expect(computeHealth(snap({ fps: 0, p95: 20, dropped: 10 }))).toBe('CRITICAL');
    });
  });
});

describe('formatBenchmarkMarkdown', () => {
  const base = snap({ p50: 12.3, p95: 22.7, fps: 4.8, dropped: 4, heapMB: 128.4 });

  it('incluye cabecera y tabla Markdown válida', () => {
    const md = formatBenchmarkMarkdown(base, '2026-07-24T10:00:00.000Z');
    expect(md).toContain('## Benchmark');
    expect(md).toContain('| Métrica | Valor |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| p50 | 12.3 ms |');
    expect(md).toContain('| p95 | 22.7 ms |');
    expect(md).toContain('| FPS inferencia | 4.8 |');
    expect(md).toContain('| Frames descartados | 4 |');
  });

  it('incluye el heap cuando está disponible', () => {
    const md = formatBenchmarkMarkdown(base, '2026-07-24T10:00:00.000Z');
    expect(md).toContain('| Heap usado | 128.4 MB |');
  });

  it('omite la fila de heap cuando es null', () => {
    const md = formatBenchmarkMarkdown(snap({ p50: 10, heapMB: null }), 'X');
    expect(md).not.toContain('Heap usado');
  });

  it('embebe el instante de captura', () => {
    const md = formatBenchmarkMarkdown(base, '2026-07-24T10:00:00.000Z');
    expect(md).toContain('_Capturado: 2026-07-24T10:00:00.000Z_');
  });
});
