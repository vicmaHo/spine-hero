/**
 * Fuente de replay: reproduce landmarks grabados desde un JSON de fixtures.
 * Implementa la interfaz PostureSource (parcialmente: calibrate se delega a posture/).
 * No requiere cámara ni modelo.
 */

import type { PostureFrame, PostureSource, CalibrationBaseline } from '../contracts/posture';
import type { Landmark } from '../contracts/worker';

/** Formato de cada entrada en un fichero de fixtures. */
export interface FixtureFrame {
  t: number;
  landmarks: Landmark[];
  inferenceMs: number;
}

type FrameCallback = (frame: PostureFrame) => void;

/**
 * Reproduce una sesión de landmarks respetando los deltas de tiempo originales.
 * Emite PostureFrame con status CALIBRATING y score 0 (los valores reales
 * los calculará el módulo posture/ cuando consuma estos frames).
 */
export class ReplaySource implements PostureSource {
  private fixtures: FixtureFrame[];
  private subscribers: Set<FrameCallback> = new Set();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private playing = false;

  constructor(fixtures: FixtureFrame[]) {
    this.fixtures = fixtures;
  }

  /** Carga fixtures desde un JSON string. */
  static fromJSON(json: string): ReplaySource {
    const frames: FixtureFrame[] = JSON.parse(json);
    return new ReplaySource(frames);
  }

  async start(): Promise<void> {
    if (this.fixtures.length === 0) return;
    this.playing = true;

    const baseTime = this.fixtures[0].t;

    for (let i = 0; i < this.fixtures.length; i++) {
      const fixture = this.fixtures[i];
      const delay = fixture.t - baseTime;

      const timer = setTimeout(() => {
        if (!this.playing) return;
        this.emit(fixture);
      }, delay);

      this.timers.push(timer);
    }
  }

  stop(): void {
    this.playing = false;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
  }

  async calibrate(): Promise<CalibrationBaseline> {
    // En modo replay no hay calibración real; devolvemos valores neutros.
    // El módulo posture/ decidirá si recalibra con los datos.
    return {
      shoulderWidth: 1,
      neckRatio: 1,
      tilt: 0,
      headTilt: 0,
      capturedAt: Date.now(),
    };
  }

  subscribe(fn: FrameCallback): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  /** Número total de frames en la sesión cargada. */
  get length(): number {
    return this.fixtures.length;
  }

  private emit(fixture: FixtureFrame): void {
    // Construimos un PostureFrame mínimo; métricas reales las calcula posture/
    const frame: PostureFrame = {
      t: fixture.t,
      status: 'CALIBRATING',
      score: 0,
      metrics: { neckRatio: 0, proximity: 0, tilt: 0, headTilt: 0 },
      confidence: this.avgVisibility(fixture.landmarks),
    };

    for (const fn of this.subscribers) {
      fn(frame);
    }
  }

  private avgVisibility(landmarks: Landmark[]): number {
    if (landmarks.length === 0) return 0;
    const sum = landmarks.reduce((acc, lm) => acc + lm.visibility, 0);
    return sum / landmarks.length;
  }
}
