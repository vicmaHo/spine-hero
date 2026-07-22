import { describe, it, expect, beforeEach } from 'vitest';
import { LandmarkRecorder } from '../recorder';
import type { FromWorkerMessage } from '../../contracts/worker';

const makeLandmarksMsg = (t: number, inferenceMs = 15): FromWorkerMessage => ({
  type: 'LANDMARKS',
  t,
  landmarks: [
    { x: 0.5, y: 0.3, z: 0, visibility: 0.99 },
    { x: 0.4, y: 0.5, z: 0, visibility: 0.95 },
    { x: 0.6, y: 0.5, z: 0, visibility: 0.96 },
    { x: 0.35, y: 0.7, z: 0, visibility: 0.98 },
    { x: 0.65, y: 0.7, z: 0, visibility: 0.97 },
  ],
  inferenceMs,
});

describe('LandmarkRecorder', () => {
  let recorder: LandmarkRecorder;

  beforeEach(() => {
    recorder = new LandmarkRecorder();
  });

  it('graba mensajes LANDMARKS', () => {
    recorder.record(makeLandmarksMsg(1000));
    recorder.record(makeLandmarksMsg(1200));
    expect(recorder.length).toBe(2);
  });

  it('ignora mensajes READY y ERROR', () => {
    recorder.record({ type: 'READY' });
    recorder.record({ type: 'ERROR', message: 'algo falló' });
    recorder.record(makeLandmarksMsg(1000));
    expect(recorder.length).toBe(1);
  });

  it('exporta JSON válido con los campos esperados', () => {
    recorder.record(makeLandmarksMsg(1000, 12));
    recorder.record(makeLandmarksMsg(1200, 18));

    const json = recorder.export();
    const parsed = JSON.parse(json);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ t: 1000, inferenceMs: 12 });
    expect(parsed[1]).toMatchObject({ t: 1200, inferenceMs: 18 });
    expect(parsed[0].landmarks).toHaveLength(5);
  });

  it('clear vacía el buffer', () => {
    recorder.record(makeLandmarksMsg(1000));
    recorder.record(makeLandmarksMsg(1200));
    recorder.clear();
    expect(recorder.length).toBe(0);
    expect(recorder.export()).toBe('[]');
  });

  it('getFrames devuelve el buffer como readonly', () => {
    recorder.record(makeLandmarksMsg(500));
    const frames = recorder.getFrames();
    expect(frames).toHaveLength(1);
    expect(frames[0].t).toBe(500);
  });
});
