import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplaySource, type FixtureFrame } from '../replaySource';
import type { PostureFrame } from '../../contracts/posture';

const makeFixtures = (): FixtureFrame[] => [
  {
    t: 1000,
    landmarks: [
      { x: 0.5, y: 0.3, z: 0, visibility: 0.99 },
      { x: 0.4, y: 0.5, z: 0, visibility: 0.95 },
      { x: 0.6, y: 0.5, z: 0, visibility: 0.96 },
      { x: 0.35, y: 0.7, z: 0, visibility: 0.98 },
      { x: 0.65, y: 0.7, z: 0, visibility: 0.97 },
    ],
    inferenceMs: 12,
  },
  {
    t: 1200,
    landmarks: [
      { x: 0.51, y: 0.31, z: 0, visibility: 0.98 },
      { x: 0.41, y: 0.51, z: 0, visibility: 0.94 },
      { x: 0.61, y: 0.51, z: 0, visibility: 0.95 },
      { x: 0.36, y: 0.71, z: 0, visibility: 0.97 },
      { x: 0.66, y: 0.71, z: 0, visibility: 0.96 },
    ],
    inferenceMs: 14,
  },
  {
    t: 1500,
    landmarks: [
      { x: 0.52, y: 0.32, z: 0, visibility: 0.97 },
      { x: 0.42, y: 0.52, z: 0, visibility: 0.93 },
      { x: 0.62, y: 0.52, z: 0, visibility: 0.94 },
      { x: 0.37, y: 0.72, z: 0, visibility: 0.96 },
      { x: 0.67, y: 0.72, z: 0, visibility: 0.95 },
    ],
    inferenceMs: 16,
  },
];

describe('ReplaySource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emite frames respetando deltas de tiempo', async () => {
    const fixtures = makeFixtures();
    const source = new ReplaySource(fixtures);
    const received: PostureFrame[] = [];

    source.subscribe((frame) => received.push(frame));
    await source.start();

    // t=0 (primer frame se dispara con delay 0)
    vi.advanceTimersByTime(0);
    expect(received).toHaveLength(1);
    expect(received[0].t).toBe(1000);

    // t=200 (segundo frame, delta = 1200-1000 = 200ms)
    vi.advanceTimersByTime(200);
    expect(received).toHaveLength(2);
    expect(received[1].t).toBe(1200);

    // t=500 (tercer frame, delta = 1500-1000 = 500ms)
    vi.advanceTimersByTime(300);
    expect(received).toHaveLength(3);
    expect(received[2].t).toBe(1500);
  });

  it('stop cancela frames pendientes', async () => {
    const fixtures = makeFixtures();
    const source = new ReplaySource(fixtures);
    const received: PostureFrame[] = [];

    source.subscribe((frame) => received.push(frame));
    await source.start();

    vi.advanceTimersByTime(0);
    expect(received).toHaveLength(1);

    source.stop();

    vi.advanceTimersByTime(1000);
    // No debería haber emitido más frames
    expect(received).toHaveLength(1);
  });

  it('calcula confidence como media de visibility', async () => {
    const fixtures = makeFixtures();
    const source = new ReplaySource(fixtures);
    const received: PostureFrame[] = [];

    source.subscribe((frame) => received.push(frame));
    await source.start();
    vi.advanceTimersByTime(0);

    // Media de: 0.99, 0.95, 0.96, 0.98, 0.97 = 4.85 / 5 = 0.97
    expect(received[0].confidence).toBeCloseTo(0.97, 2);
  });

  it('fromJSON parsea correctamente un string de fixtures', () => {
    const fixtures = makeFixtures();
    const json = JSON.stringify(fixtures);
    const source = ReplaySource.fromJSON(json);
    expect(source.length).toBe(3);
  });

  it('subscribe devuelve función de unsub', async () => {
    const fixtures = makeFixtures();
    const source = new ReplaySource(fixtures);
    const received: PostureFrame[] = [];

    const unsub = source.subscribe((frame) => received.push(frame));
    unsub();

    await source.start();
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(0);
  });

  it('no falla con fixtures vacíos', async () => {
    const source = new ReplaySource([]);
    const received: PostureFrame[] = [];
    source.subscribe((frame) => received.push(frame));
    await source.start();
    vi.advanceTimersByTime(1000);
    expect(received).toHaveLength(0);
  });
});
