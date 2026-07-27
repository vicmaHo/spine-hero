import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMinuteBuffer } from './minuteBuffer';
import type { PostureFrame } from '../contracts/posture';

/** Helper para crear un PostureFrame mínimo. */
function makeFrame(
  status: PostureFrame['status'],
  score: number
): PostureFrame {
  return {
    t: Date.now(),
    status,
    score,
    metrics: { neckRatio: 0.9, proximity: 1.0, tilt: 0, headTilt: 0 },
    confidence: 0.95,
  };
}

describe('minuteBuffer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('flush devuelve null si no se acumularon frames', () => {
    const buf = createMinuteBuffer();
    expect(buf.flush()).toBeNull();
  });

  it('push ignora frames con status AWAY, CALIBRATING, LOW_CONF', () => {
    const buf = createMinuteBuffer();
    buf.push(makeFrame('AWAY', 50));
    buf.push(makeFrame('CALIBRATING', 60));
    buf.push(makeFrame('LOW_CONF', 70));
    expect(buf.flush()).toBeNull();
  });

  it('acumula frames GOOD y BAD y calcula avgScore correctamente', () => {
    // El minuto se captura al primer push, así que el reloj se fija antes.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:30:00'));

    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));
    buf.push(makeFrame('GOOD', 90));
    buf.push(makeFrame('BAD', 40));

    const entry = buf.flush();
    expect(entry).not.toBeNull();
    expect(entry!.avgScore).toBe(70); // (80+90+40)/3 = 70
    expect(entry!.date).toBe('2025-01-15');
    expect(entry!.minute).toBe(10 * 60 + 30); // 630
  });

  it('etiqueta la entrada con el minuto en que se acumuló, no con el del flush', () => {
    // `minuteWriter` vuelca justo DESPUÉS de cruzar el límite de minuto: si el
    // minuto se leyera en `flush()`, esta entrada quedaría etiquetada como 631.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:30:20'));

    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));

    vi.setSystemTime(new Date('2025-01-15T10:31:00'));

    const entry = buf.flush()!;
    expect(entry.minute).toBe(10 * 60 + 30); // 630, el minuto medido
  });

  it('atribuye al día correcto lo acumulado en el último minuto de la noche', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T23:59:30'));

    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));

    // El flush cae ya en el día siguiente.
    vi.setSystemTime(new Date('2025-01-16T00:00:00'));

    const entry = buf.flush()!;
    expect(entry.date).toBe('2025-01-15');
    expect(entry.minute).toBe(23 * 60 + 59); // 1439
  });

  it('tras un reset, la clave la fija el primer frame del tramo nuevo', () => {
    // Es lo que evita que el flush de `stop()`, a mitad de minuto, escriba bajo
    // la clave del minuto ya volcado y lo sobrescriba (db.put es upsert).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T10:30:10'));

    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));

    vi.setSystemTime(new Date('2025-01-15T10:31:00'));
    expect(buf.flush()!.minute).toBe(630);
    buf.reset();

    // Tramo siguiente: frames del minuto 631, parada a mitad de minuto.
    buf.push(makeFrame('GOOD', 70));
    vi.setSystemTime(new Date('2025-01-15T10:31:30'));

    expect(buf.flush()!.minute).toBe(631);
  });

  it('dominantStatus es GOOD cuando hay más frames GOOD', () => {
    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));
    buf.push(makeFrame('GOOD', 85));
    buf.push(makeFrame('BAD', 40));

    const entry = buf.flush()!;
    expect(entry.dominantStatus).toBe('GOOD');
  });

  it('dominantStatus es BAD en empate', () => {
    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));
    buf.push(makeFrame('BAD', 40));

    const entry = buf.flush()!;
    expect(entry.dominantStatus).toBe('BAD');
  });

  it('goodSeconds = floor(goodFrames / 5) clamped a [0, 60]', () => {
    const buf = createMinuteBuffer();
    // 12 frames GOOD → floor(12/5) = 2
    for (let i = 0; i < 12; i++) buf.push(makeFrame('GOOD', 80));

    const entry = buf.flush()!;
    expect(entry.goodSeconds).toBe(2);
  });

  it('goodSeconds se clampea a 60 máximo', () => {
    const buf = createMinuteBuffer();
    // 350 frames GOOD → floor(350/5) = 70, clamped a 60
    for (let i = 0; i < 350; i++) buf.push(makeFrame('GOOD', 80));

    const entry = buf.flush()!;
    expect(entry.goodSeconds).toBe(60);
  });

  it('reset limpia el estado acumulado', () => {
    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));
    buf.reset();
    expect(buf.flush()).toBeNull();
  });

  it('avgScore se redondea al entero más cercano', () => {
    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 33));
    buf.push(makeFrame('GOOD', 33));
    buf.push(makeFrame('GOOD', 34));
    // (33+33+34)/3 = 33.333... → 33

    const entry = buf.flush()!;
    expect(entry.avgScore).toBe(33);
  });
});
