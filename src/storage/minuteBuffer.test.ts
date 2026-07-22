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
    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));
    buf.push(makeFrame('GOOD', 90));
    buf.push(makeFrame('BAD', 40));

    // Fijar la fecha para el flush
    vi.setSystemTime(new Date('2025-01-15T10:30:00'));

    const entry = buf.flush();
    expect(entry).not.toBeNull();
    expect(entry!.avgScore).toBe(70); // (80+90+40)/3 = 70
    expect(entry!.date).toBe('2025-01-15');
    expect(entry!.minute).toBe(10 * 60 + 30); // 630
  });

  it('dominantStatus es GOOD cuando hay más frames GOOD', () => {
    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));
    buf.push(makeFrame('GOOD', 85));
    buf.push(makeFrame('BAD', 40));

    vi.setSystemTime(new Date('2025-01-15T00:00:00'));
    const entry = buf.flush()!;
    expect(entry.dominantStatus).toBe('GOOD');
  });

  it('dominantStatus es BAD en empate', () => {
    const buf = createMinuteBuffer();
    buf.push(makeFrame('GOOD', 80));
    buf.push(makeFrame('BAD', 40));

    vi.setSystemTime(new Date('2025-01-15T00:00:00'));
    const entry = buf.flush()!;
    expect(entry.dominantStatus).toBe('BAD');
  });

  it('goodSeconds = floor(goodFrames / 5) clamped a [0, 60]', () => {
    const buf = createMinuteBuffer();
    // 12 frames GOOD → floor(12/5) = 2
    for (let i = 0; i < 12; i++) buf.push(makeFrame('GOOD', 80));

    vi.setSystemTime(new Date('2025-01-15T00:00:00'));
    const entry = buf.flush()!;
    expect(entry.goodSeconds).toBe(2);
  });

  it('goodSeconds se clampea a 60 máximo', () => {
    const buf = createMinuteBuffer();
    // 350 frames GOOD → floor(350/5) = 70, clamped a 60
    for (let i = 0; i < 350; i++) buf.push(makeFrame('GOOD', 80));

    vi.setSystemTime(new Date('2025-01-15T00:00:00'));
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

    vi.setSystemTime(new Date('2025-01-15T00:00:00'));
    const entry = buf.flush()!;
    expect(entry.avgScore).toBe(33);
  });
});
