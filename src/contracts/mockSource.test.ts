import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockPostureSource } from './mockSource';
import type { PostureFrame } from './posture';

describe('createMockPostureSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emite GOOD durante los primeros 30 s', () => {
    const source = createMockPostureSource();
    const frames: PostureFrame[] = [];
    source.subscribe((f) => frames.push(f));

    source.start();
    // Avanzar 10 s → debería estar en GOOD
    vi.advanceTimersByTime(10_000);

    expect(frames.length).toBeGreaterThan(0);
    const lastFrame = frames[frames.length - 1];
    expect(lastFrame.status).toBe('GOOD');
    expect(lastFrame.score).toBeGreaterThanOrEqual(85);
    expect(lastFrame.score).toBeLessThanOrEqual(95);

    source.stop();
  });

  it('a los 35 s el estado es BAD', () => {
    const source = createMockPostureSource();
    const frames: PostureFrame[] = [];
    source.subscribe((f) => frames.push(f));

    source.start();
    // 35 s = 30 s GOOD + 5 s transición → ya en BAD
    vi.advanceTimersByTime(35_000);

    const lastFrame = frames[frames.length - 1];
    expect(lastFrame.status).toBe('BAD');

    source.stop();
  });

  it('a los 60 s el estado es AWAY con confidence 0', () => {
    const source = createMockPostureSource();
    const frames: PostureFrame[] = [];
    source.subscribe((f) => frames.push(f));

    source.start();
    // 60 s = 30 + 5 + 20 + 5 = 60 → inicio de AWAY
    vi.advanceTimersByTime(60_500);

    const lastFrame = frames[frames.length - 1];
    expect(lastFrame.status).toBe('AWAY');
    expect(lastFrame.confidence).toBe(0);

    source.stop();
  });

  it('calibrate() resuelve tras 2 s con baseline plausible', async () => {
    const source = createMockPostureSource();

    const promise = source.calibrate();
    vi.advanceTimersByTime(2_000);
    const baseline = await promise;

    expect(baseline.shoulderWidth).toBeGreaterThan(0);
    expect(baseline.neckRatio).toBeGreaterThan(0);
    expect(baseline.capturedAt).toBeGreaterThan(0);
  });

  it('stop() detiene la emisión de frames', () => {
    const source = createMockPostureSource();
    const frames: PostureFrame[] = [];
    source.subscribe((f) => frames.push(f));

    source.start();
    vi.advanceTimersByTime(1_000);
    const countBefore = frames.length;

    source.stop();
    vi.advanceTimersByTime(5_000);

    expect(frames.length).toBe(countBefore);
  });

  it('subscribe devuelve función para cancelar la suscripción', () => {
    const source = createMockPostureSource();
    const frames: PostureFrame[] = [];
    const unsub = source.subscribe((f) => frames.push(f));

    source.start();
    vi.advanceTimersByTime(1_000);
    const countBefore = frames.length;

    unsub();
    vi.advanceTimersByTime(5_000);

    expect(frames.length).toBe(countBefore);
    source.stop();
  });

  it('el ciclo vuelve a GOOD tras AWAY (~70 s)', () => {
    const source = createMockPostureSource();
    const frames: PostureFrame[] = [];
    source.subscribe((f) => frames.push(f));

    source.start();
    // Ciclo completo = 70 s, luego vuelve a GOOD
    vi.advanceTimersByTime(70_200);

    const lastFrame = frames[frames.length - 1];
    expect(lastFrame.status).toBe('GOOD');

    source.stop();
  });
});
