import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPostureSource, type LandmarkSource } from '../postureSource';
import type { Landmark } from '../../contracts/worker';
import type { PostureFrame } from '../../contracts/posture';

/**
 * Tests del orquestador con estado (único fichero impuro de posture/).
 * Cubren el flujo de calibración (éxito y fallo por < 15 frames válidos),
 * el pipeline normal tras obtener baseline, el descarte de frames sin baseline
 * y el reinicio de estado en stop().
 */

// --- Doble del proveedor de landmarks ---

interface MockLandmarkSource extends LandmarkSource {
  started: boolean;
  stopped: boolean;
  emit(t: number, landmarks: Landmark[]): void;
}

function createMockSource(): MockLandmarkSource {
  let cb: ((e: { t: number; landmarks: Landmark[] }) => void) | null = null;
  return {
    started: false,
    stopped: false,
    async start() {
      this.started = true;
    },
    stop() {
      this.stopped = true;
    },
    subscribe(fn) {
      cb = fn;
      return () => {
        cb = null;
      };
    },
    emit(t, landmarks) {
      cb?.({ t, landmarks });
    },
  };
}

// Landmarks erguidos y estables (visibility alta → confidence ≈ 0.95).
function goodLandmarks(visibility = 0.95): Landmark[] {
  return [
    { x: 0.5, y: 0.25, z: 0, visibility },   // NOSE
    { x: 0.46, y: 0.27, z: 0, visibility },  // LEFT_EAR
    { x: 0.54, y: 0.27, z: 0, visibility },  // RIGHT_EAR
    { x: 0.4, y: 0.45, z: 0, visibility },   // LEFT_SHOULDER
    { x: 0.6, y: 0.45, z: 0, visibility },   // RIGHT_SHOULDER
  ];
}

const START = 1000;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('postureSource · calibración', () => {
  it('resuelve con una baseline cuando llegan suficientes frames válidos', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(START);
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const calibration = ps.calibrate();

    // 20 frames válidos dentro de la ventana de 5 s.
    for (let i = 0; i < 20; i++) {
      mock.emit(START + i * 200, goodLandmarks());
    }
    // Frame pasada la ventana: dispara la comprobación de completado.
    mock.emit(START + 5200, goodLandmarks());

    const baseline = await calibration;
    expect(baseline.shoulderWidth).toBeCloseTo(0.2, 5);
    expect(baseline.capturedAt).toBe(START);
  });

  it('rechaza con un error claro si hay < 15 frames válidos tras la ventana', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(START);
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const calibration = ps.calibrate();

    // Solo 5 frames válidos antes de que se agote la ventana.
    for (let i = 0; i < 5; i++) {
      mock.emit(START + i * 200, goodLandmarks());
    }
    // Frame pasada la ventana → completa con 6 < 15 → rechazo.
    mock.emit(START + 5200, goodLandmarks());

    await expect(calibration).rejects.toThrow(/frames válidos/);
    await expect(calibration).rejects.toThrow(/15/);
  });

  it('descarta frames de baja confianza durante la calibración', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(START);
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const calibration = ps.calibrate();

    // 30 frames pero todos con visibility baja (< 0.7) → ninguno cuenta.
    for (let i = 0; i < 30; i++) {
      mock.emit(START + i * 100, goodLandmarks(0.4));
    }
    mock.emit(START + 5200, goodLandmarks(0.4));

    // Aunque llegaron muchos frames, ninguno es válido → falla.
    await expect(calibration).rejects.toThrow(/frames válidos/);
  });

  it('emite frames con status CALIBRATING mientras calibra', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(START);
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const frames: PostureFrame[] = [];
    ps.subscribe((f) => frames.push(f));

    void ps.calibrate();
    mock.emit(START + 200, goodLandmarks());

    expect(frames).toHaveLength(1);
    expect(frames[0].status).toBe('CALIBRATING');
  });

  it('la promesa queda pendiente si los frames se cortan antes de la ventana', async () => {
    // Documenta que el completado es edge-triggered: sin frame posterior a la
    // ventana, posture/ no resuelve por sí solo (el store aporta el timeout).
    vi.spyOn(Date, 'now').mockReturnValue(START);
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const calibration = ps.calibrate();
    for (let i = 0; i < 20; i++) {
      mock.emit(START + i * 100, goodLandmarks()); // todos dentro de la ventana
    }

    const sentinel = Symbol('pending');
    const winner = await Promise.race([
      calibration.then(() => 'settled', () => 'settled'),
      Promise.resolve(sentinel),
    ]);
    expect(winner).toBe(sentinel);
  });
});

describe('postureSource · pipeline normal', () => {
  it('tras calibrar, procesa landmarks y emite GOOD con postura buena', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(START);
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const frames: PostureFrame[] = [];
    ps.subscribe((f) => frames.push(f));

    const calibration = ps.calibrate();
    for (let i = 0; i < 20; i++) mock.emit(START + i * 200, goodLandmarks());
    mock.emit(START + 5200, goodLandmarks());
    await calibration;

    // Frame post-baseline con la misma postura: debe puntuar alto y ser GOOD.
    mock.emit(START + 6000, goodLandmarks());
    const last = frames.at(-1)!;
    expect(last.status).toBe('GOOD');
    expect(last.score).toBeGreaterThan(80);
  });

  it('ignora frames si no hay baseline ni calibración en curso', async () => {
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const frames: PostureFrame[] = [];
    ps.subscribe((f) => frames.push(f));

    mock.emit(START, goodLandmarks());
    expect(frames).toHaveLength(0);
  });
});

describe('postureSource · ciclo de vida', () => {
  it('start() arranca la fuente y stop() la detiene y desuscribe', async () => {
    const mock = createMockSource();
    const ps = createPostureSource(mock);

    await ps.start();
    expect(mock.started).toBe(true);

    const frames: PostureFrame[] = [];
    ps.subscribe((f) => frames.push(f));

    ps.stop();
    expect(mock.stopped).toBe(true);

    // Tras stop() la suscripción a la fuente se cortó: emitir no hace nada.
    mock.emit(START, goodLandmarks());
    expect(frames).toHaveLength(0);
  });

  it('stop() reinicia el baseline: los frames posteriores vuelven a ignorarse', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(START);
    const mock = createMockSource();
    const ps = createPostureSource(mock);
    await ps.start();

    const calibration = ps.calibrate();
    for (let i = 0; i < 20; i++) mock.emit(START + i * 200, goodLandmarks());
    mock.emit(START + 5200, goodLandmarks());
    await calibration;

    ps.stop();

    // Rearrancamos y suscribimos: sin recalibrar, no debe emitir frames de pipeline.
    await ps.start();
    const frames: PostureFrame[] = [];
    ps.subscribe((f) => frames.push(f));
    mock.emit(START + 7000, goodLandmarks());
    expect(frames).toHaveLength(0);
  });
});
