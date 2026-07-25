import { describe, it, expect, beforeEach } from 'vitest';
import { PerfStats } from '../perfStats';

describe('PerfStats', () => {
  let stats: PerfStats;

  beforeEach(() => {
    stats = new PerfStats(10);
  });

  it('devuelve 0 cuando no hay muestras', () => {
    expect(stats.getP50()).toBe(0);
    expect(stats.getP95()).toBe(0);
    expect(stats.getFps()).toBe(0);
    expect(stats.getDropped()).toBe(0);
  });

  it('calcula p50 correctamente', () => {
    // Muestras: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
    for (let i = 1; i <= 10; i++) {
      stats.push(i * 10, i * 1000);
    }
    expect(stats.getP50()).toBe(50);
  });

  it('calcula p95 correctamente', () => {
    for (let i = 1; i <= 10; i++) {
      stats.push(i * 10, i * 1000);
    }
    // ceil(0.95 * 10) - 1 = 9 → sorted[9] = 100
    expect(stats.getP95()).toBe(100);
  });

  it('respeta el tamaño de ventana deslizante', () => {
    // Ventana de 10, metemos 15 muestras
    for (let i = 1; i <= 15; i++) {
      stats.push(i * 10, i * 1000);
    }
    // Solo quedan las últimas 10: 60, 70, 80, 90, 100, 110, 120, 130, 140, 150
    // p50 = sorted[ceil(0.5*10)-1] = sorted[4] = 100
    expect(stats.getP50()).toBe(100);
  });

  it('calcula FPS reales', () => {
    // 5 muestras en 1 segundo (de t=1000 a t=2000)
    for (let i = 0; i < 5; i++) {
      stats.push(20, 1000 + i * 250);
    }
    // 5 frames / 1 segundo = 5 FPS
    expect(stats.getFps()).toBe(5);
  });

  it('incrementa frames descartados', () => {
    stats.incrementDropped();
    stats.incrementDropped();
    stats.incrementDropped();
    expect(stats.getDropped()).toBe(3);
  });

  it('resetea todas las estadísticas', () => {
    stats.push(50, 1000);
    stats.incrementDropped();
    stats.reset();
    expect(stats.getP50()).toBe(0);
    expect(stats.getDropped()).toBe(0);
    expect(stats.getFps()).toBe(0);
  });

  // --- Casos borde ---

  it('con una sola muestra, p50 y p95 son ese valor y FPS es 0 (elapsed nulo)', () => {
    stats.push(42, 1000);
    expect(stats.getP50()).toBe(42);
    expect(stats.getP95()).toBe(42);
    // Un único timestamp: first === last → elapsed 0 → sin FPS calculable.
    expect(stats.getFps()).toBe(0);
  });

  it('ordena internamente aunque las muestras lleguen desordenadas', () => {
    // Insertadas en orden descendente; el percentil debe salir igual.
    for (let i = 10; i >= 1; i--) {
      stats.push(i * 10, (11 - i) * 1000);
    }
    expect(stats.getP50()).toBe(50);
    expect(stats.getP95()).toBe(100);
  });

  it('los frames descartados son independientes de la ventana de muestras', () => {
    // La ventana desborda (15 > 10) pero dropped no se ve afectado.
    for (let i = 1; i <= 15; i++) stats.push(i, i * 1000);
    stats.incrementDropped();
    stats.incrementDropped();
    expect(stats.getDropped()).toBe(2);
  });

  it('el FPS refleja frames totales procesados, no solo los de la ventana', () => {
    // 20 frames en 4s (t de 1000 a 5000, paso 200ms) con ventana de 10.
    for (let i = 0; i < 20; i++) stats.push(15, 1000 + i * 200);
    // 20 frames / 3.8s ≈ 5.26 → redondeo del cálculo interno.
    expect(stats.getFps()).toBeCloseTo(20 / 3.8, 1);
  });
});
