/**
 * Lógica pura derivada de una instantánea de rendimiento: tipo del snapshot,
 * clasificación de salud del pipeline y formato Markdown para BENCHMARKS.md.
 * Sin React, sin DOM: testeable en Node.
 */

/** Instantánea de métricas de rendimiento en un instante concreto. */
export interface PerfSnapshot {
  p50: number;
  p95: number;
  fps: number;
  /** Frames descartados acumulados en la sesión. */
  dropped: number;
  /** Frames descartados desde el sondeo anterior (para detectar subidas rápidas). */
  droppedDelta: number;
  heapMB: number | null;
}

export const EMPTY_SNAPSHOT: PerfSnapshot = {
  p50: 0,
  p95: 0,
  fps: 0,
  dropped: 0,
  droppedDelta: 0,
  heapMB: null,
};

export type HealthLevel = 'IDLE' | 'HEALTHY' | 'WARNING' | 'CRITICAL';

/**
 * Umbrales de salud del pipeline. El objetivo del producto es 5 FPS de
 * inferencia; por debajo de 3 la experiencia se degrada visiblemente.
 */
export const HEALTH_THRESHOLDS = {
  FPS_HEALTHY: 4.5,
  FPS_CRITICAL: 3.0,
  P95_MAX_MS: 25,
  /** > este valor de descartados por sondeo → WARNING. */
  DROPPED_DELTA_WARN: 2,
  /** >= este valor de descartados por sondeo → CRITICAL (subida rápida). */
  DROPPED_DELTA_CRITICAL: 5,
} as const;

/**
 * Clasifica la salud del pipeline a partir de una instantánea.
 * IDLE cuando aún no hay ninguna medición (evita mostrar rojo en el arranque).
 */
export function computeHealth(snap: PerfSnapshot): HealthLevel {
  if (snap.fps === 0 && snap.p95 === 0 && snap.dropped === 0) return 'IDLE';

  const t = HEALTH_THRESHOLDS;
  if (snap.fps < t.FPS_CRITICAL || snap.droppedDelta >= t.DROPPED_DELTA_CRITICAL) {
    return 'CRITICAL';
  }
  if (
    snap.fps < t.FPS_HEALTHY ||
    snap.p95 > t.P95_MAX_MS ||
    snap.droppedDelta > t.DROPPED_DELTA_WARN
  ) {
    return 'WARNING';
  }
  return 'HEALTHY';
}

/**
 * Genera una tabla Markdown lista para pegar en docs/BENCHMARKS.md.
 * El instante se pasa como argumento para mantener la función pura.
 */
export function formatBenchmarkMarkdown(snap: PerfSnapshot, capturedAt: string): string {
  const rows = [
    `| p50 | ${snap.p50.toFixed(1)} ms |`,
    `| p95 | ${snap.p95.toFixed(1)} ms |`,
    `| FPS inferencia | ${snap.fps.toFixed(1)} |`,
    `| Frames descartados | ${snap.dropped} |`,
  ];
  if (snap.heapMB !== null) {
    rows.push(`| Heap usado | ${snap.heapMB.toFixed(1)} MB |`);
  }

  return [
    '## Benchmark',
    '',
    '| Métrica | Valor |',
    '| --- | --- |',
    ...rows,
    '',
    `_Capturado: ${capturedAt}_`,
    '',
  ].join('\n');
}
