// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CameraSource, WASM_PATH, MODEL_PATH } from '../cameraSource';
import type { FromWorkerMessage } from '../../contracts/worker';

/**
 * Estos tests validan el ciclo de vida del pipeline (arranque, fallo de init
 * del modelo y stop()) sin cámara ni WASM reales: mockeamos Worker,
 * getUserMedia, el <video> y createImageBitmap. El worker real nunca se importa
 * porque sustituimos el constructor global.
 */

// --- Doble del Worker ---

type Emit = (data: FromWorkerMessage) => void;

/** Respuesta que el worker falso dará al recibir INIT. */
let initResponse: { ok: true } | { ok: false; message: string } = { ok: true };

const workers: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  private listeners = new Map<string, Set<(e: MessageEvent) => void>>();
  posted: unknown[] = [];
  transfers: unknown[][] = [];
  terminated = false;

  url: unknown;
  opts: unknown;

  constructor(url: unknown, opts: unknown) {
    this.url = url;
    this.opts = opts;
    workers.push(this);
  }

  postMessage(msg: unknown, transfer?: unknown[]): void {
    this.posted.push(msg);
    if (transfer) this.transfers.push(transfer);
    // Responder a INIT en un microtask, como haría un worker real de forma async.
    if ((msg as { type?: string })?.type === 'INIT') {
      queueMicrotask(() => {
        if (initResponse.ok) this.emit({ type: 'READY' });
        else this.emit({ type: 'ERROR', message: initResponse.message });
      });
    }
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: (e: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(fn);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit: Emit = (data) => {
    const ev = { data } as MessageEvent;
    this.onmessage?.(ev);
    this.listeners.get('message')?.forEach((fn) => fn(ev));
  };
}

// --- Dobles de la cámara y el <video> ---

let getUserMedia: ReturnType<typeof vi.fn>;
let trackStop: ReturnType<typeof vi.fn>;
let rvfcCallback: ((now: number, meta: { mediaTime: number }) => void) | null = null;
let cancelVideoFrameCallback: ReturnType<typeof vi.fn>;

function makeFakeStream(): MediaStream {
  return {
    getTracks: () => [{ stop: trackStop, kind: 'video' }],
  } as unknown as MediaStream;
}

beforeEach(() => {
  workers.length = 0;
  initResponse = { ok: true };
  rvfcCallback = null;

  trackStop = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue(makeFakeStream());

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });

  // srcObject como propiedad de datos simple: jsdom no lo implementa.
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    writable: true,
    configurable: true,
    value: null,
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

  // requestVideoFrameCallback no existe en jsdom: lo simulamos capturando el cb.
  let rvfcId = 0;
  cancelVideoFrameCallback = vi.fn();
  (HTMLVideoElement.prototype as unknown as {
    requestVideoFrameCallback: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  }).requestVideoFrameCallback = (cb) => {
    rvfcCallback = cb;
    return ++rvfcId;
  };
  (HTMLVideoElement.prototype as unknown as {
    cancelVideoFrameCallback: (id: number) => void;
  }).cancelVideoFrameCallback = cancelVideoFrameCallback as unknown as (id: number) => void;

  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
  // performance.now fijo: el throttle de 5 FPS se vuelve determinista.
  vi.spyOn(performance, 'now').mockReturnValue(10_000);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CameraSource — arranque', () => {
  it('start() resuelve ok y envía INIT con rutas locales', async () => {
    const cam = new CameraSource();
    const result = await cam.start();

    expect(result.ok).toBe(true);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(1);
    expect(workers[0].posted[0]).toMatchObject({
      type: 'INIT',
      wasmPath: WASM_PATH,
      modelPath: MODEL_PATH,
    });
    // Nunca una URL externa: rutas relativas a /public.
    expect(WASM_PATH).toBe('/wasm');
    expect(MODEL_PATH).toBe('/models/pose_landmarker_lite.task');

    cam.stop();
  });

  it('mapea NotAllowedError a CAMERA_DENIED sin crear worker', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denegado', 'NotAllowedError'));
    const cam = new CameraSource();
    const result = await cam.start();

    expect(result).toEqual({ ok: false, error: { kind: 'CAMERA_DENIED' } });
    expect(workers).toHaveLength(0);
  });

  it('mapea NotReadableError a CAMERA_BUSY', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('ocupada', 'NotReadableError'));
    const cam = new CameraSource();
    const result = await cam.start();

    expect(result).toEqual({ ok: false, error: { kind: 'CAMERA_BUSY' } });
  });
});

describe('CameraSource — fallo de inicialización del modelo', () => {
  it('propaga MODEL_LOAD_FAILED y no deja worker ni cámara vivos', async () => {
    initResponse = { ok: false, message: 'wasm 404' };
    const cam = new CameraSource();
    const result = await cam.start();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ kind: 'MODEL_LOAD_FAILED', detail: 'wasm 404' });
    }
    // El worker creado se termina (si no, quedaría huérfano).
    expect(workers[0].terminated).toBe(true);
    // Y la cámara se libera.
    expect(trackStop).toHaveBeenCalled();
  });
});

describe('CameraSource — ciclo de vida de stop()', () => {
  it('detiene tracks, termina el worker y cancela el rVFC', async () => {
    const cam = new CameraSource();
    await cam.start();

    cam.stop();

    expect(trackStop).toHaveBeenCalledOnce();
    expect(workers[0].terminated).toBe(true);
    expect(workers[0].posted).toContainEqual({ type: 'STOP' });
    expect(cancelVideoFrameCallback).toHaveBeenCalled();
    expect(cam.getStream()).toBeNull();
  });

  it('desengancha onmessage antes de terminar el worker', async () => {
    const cam = new CameraSource();
    await cam.start();
    cam.stop();
    expect(workers[0].onmessage).toBeNull();
  });

  it('doble stop() es idempotente y no lanza', async () => {
    const cam = new CameraSource();
    await cam.start();
    cam.stop();
    expect(() => cam.stop()).not.toThrow();
  });

  it('stop() sin start() previo no lanza', () => {
    const cam = new CameraSource();
    expect(() => cam.stop()).not.toThrow();
  });
});

describe('CameraSource — captura de frame', () => {
  it('captura un bitmap y lo envía al worker como transferible', async () => {
    const cam = new CameraSource();
    await cam.start();

    // Disparar un frame de vídeo manualmente (rVFC está mockeado).
    expect(rvfcCallback).not.toBeNull();
    rvfcCallback!(10_000, { mediaTime: 0 });

    // Esperar a que createImageBitmap resuelva y se postee el FRAME.
    await vi.waitFor(() => {
      const frameMsg = workers[0].posted.find(
        (m) => (m as { type?: string })?.type === 'FRAME',
      );
      expect(frameMsg).toBeDefined();
    });

    expect(createImageBitmap).toHaveBeenCalled();
    // El bitmap viaja en la lista de transferibles, no por copia.
    expect(workers[0].transfers.length).toBeGreaterThan(0);

    cam.stop();
  });
});
