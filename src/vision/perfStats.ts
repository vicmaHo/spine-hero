/** Tamaño por defecto de la ventana deslizante de muestras. */
export const DEFAULT_WINDOW_SIZE = 100;

/**
 * Estadísticas de rendimiento del pipeline de inferencia.
 * Ventana deslizante para calcular percentiles y FPS reales.
 */
export class PerfStats {
  private samples: number[] = [];
  private windowSize: number;
  private dropped = 0;
  private firstSampleAt: number | null = null;
  private lastSampleAt: number | null = null;
  private totalProcessed = 0;

  constructor(windowSize = DEFAULT_WINDOW_SIZE) {
    this.windowSize = windowSize;
  }

  /** Registra una muestra de inferencia en milisegundos. */
  push(inferenceMs: number, now = performance.now()): void {
    if (this.firstSampleAt === null) this.firstSampleAt = now;
    this.lastSampleAt = now;
    this.totalProcessed++;

    this.samples.push(inferenceMs);
    if (this.samples.length > this.windowSize) {
      this.samples.shift();
    }
  }

  /** Percentil 50 de la ventana actual (ms). */
  getP50(): number {
    return this.percentile(0.5);
  }

  /** Percentil 95 de la ventana actual (ms). */
  getP95(): number {
    return this.percentile(0.95);
  }

  /** FPS reales: frames procesados / tiempo transcurrido. */
  getFps(): number {
    if (this.firstSampleAt === null || this.lastSampleAt === null) return 0;
    const elapsed = (this.lastSampleAt - this.firstSampleAt) / 1000;
    if (elapsed <= 0) return 0;
    return this.totalProcessed / elapsed;
  }

  /** Número acumulado de frames descartados. */
  getDropped(): number {
    return this.dropped;
  }

  /** Incrementa el contador de frames descartados. */
  incrementDropped(): void {
    this.dropped++;
  }

  /** Resetea todas las estadísticas. */
  reset(): void {
    this.samples = [];
    this.dropped = 0;
    this.firstSampleAt = null;
    this.lastSampleAt = null;
    this.totalProcessed = 0;
  }

  private percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
}
