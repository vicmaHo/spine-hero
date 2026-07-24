/**
 * Controlador del pipeline de visión en el hilo principal.
 * Captura vídeo con getUserMedia, bombea frames al Web Worker a ≤5 FPS,
 * descarta frames si la inferencia anterior aún no ha terminado.
 */

import type { FromWorkerMessage, Landmark } from '../contracts/worker';
import type { PostureError } from '../contracts/posture';
import { PerfStats } from './perfStats';
import { LandmarkRecorder } from './recorder';

// --- Configuración ---

/** Intervalo mínimo entre frames enviados al worker (ms). 200 ms = 5 FPS. */
export const MIN_FRAME_INTERVAL_MS = 200;

/** Rutas locales de los assets de MediaPipe (servidos desde /public). */
export const WASM_PATH = '/wasm';
export const MODEL_PATH = '/models/pose_landmarker_lite.task';

// --- Tipos de callback ---

export interface LandmarksEvent {
  t: number;
  landmarks: Landmark[];
  inferenceMs: number;
}

type LandmarksCallback = (event: LandmarksEvent) => void;

// --- Resultado de start() ---

export type CameraStartResult =
  | { ok: true }
  | { ok: false; error: PostureError };

/**
 * Pipeline de captura + inferencia.
 * Uso:
 *   const cam = new CameraSource();
 *   cam.subscribe(cb);
 *   const result = await cam.start();
 *   // ...
 *   cam.stop();
 */
export class CameraSource {
  private worker: Worker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private busy = false;
  private lastFrameTime = 0;
  private callbackId: number | null = null;
  private running = false;
  private subscribers: Set<LandmarksCallback> = new Set();

  /** Estadísticas de rendimiento expuestas al panel. */
  readonly stats = new PerfStats();

  /** Grabador de sesiones (activar con `recorder.record(msg)` desde el listener). */
  readonly recorder = new LandmarkRecorder();

  /** Si true, graba automáticamente cada LANDMARKS en el recorder. */
  recording = false;

  /** Devuelve el MediaStream activo (para preview de vídeo). Null si no está corriendo. */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /** Suscribe un callback que se invoca con cada respuesta LANDMARKS. */
  subscribe(fn: LandmarksCallback): () => void {
    this.subscribers.add(fn);
    return () => { this.subscribers.delete(fn); };
  }

  /** Inicia la captura y la inferencia. */
  async start(): Promise<CameraStartResult> {
    // Pedir cámara
    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { min: 640 }, height: { min: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err: unknown) {
      return { ok: false, error: this.mapCameraError(err) };
    }

    this.stream = mediaStream;

    // Crear <video> oculto para alimentar requestVideoFrameCallback
    const video = document.createElement('video');
    video.srcObject = mediaStream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    this.video = video;

    // Crear worker
    const worker = new Worker(
      new URL('./inferenceWorker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker = worker;

    // Esperar READY o ERROR del worker
    const initResult = await this.initWorker(worker);
    if (!initResult.ok) {
      this.cleanup();
      return initResult;
    }

    // Escuchar respuestas del worker
    worker.onmessage = (e: MessageEvent<FromWorkerMessage>) => {
      this.handleWorkerMessage(e.data);
    };

    // Arrancar el loop de captura
    this.running = true;
    this.scheduleFrame();

    return { ok: true };
  }

  /** Detiene la captura y libera recursos. */
  stop(): void {
    this.running = false;

    if (this.worker) {
      this.worker.postMessage({ type: 'STOP' });
      this.worker.terminate();
      this.worker = null;
    }

    this.cleanup();
  }

  // --- Internos ---

  private initWorker(worker: Worker): Promise<CameraStartResult> {
    return new Promise((resolve) => {
      const onMessage = (e: MessageEvent<FromWorkerMessage>) => {
        worker.removeEventListener('message', onMessage);
        if (e.data.type === 'READY') {
          resolve({ ok: true });
        } else if (e.data.type === 'ERROR') {
          resolve({
            ok: false,
            error: { kind: 'MODEL_LOAD_FAILED', detail: e.data.message },
          });
        }
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'INIT', wasmPath: WASM_PATH, modelPath: MODEL_PATH });
    });
  }

  private scheduleFrame(): void {
    if (!this.video || !this.running) return;

    // requestVideoFrameCallback se sincroniza con el framerate real del vídeo
    this.callbackId = this.video.requestVideoFrameCallback((_now, metadata) => {
      this.onVideoFrame(metadata.mediaTime ?? performance.now());
    });
  }

  private onVideoFrame(_mediaTime: number): void {
    if (!this.running || !this.video || !this.worker) return;

    const now = performance.now();

    // Throttle a 5 FPS (200 ms mínimo entre envíos)
    if (now - this.lastFrameTime < MIN_FRAME_INTERVAL_MS) {
      this.scheduleFrame();
      return;
    }

    // Si el worker está ocupado, descartar
    if (this.busy) {
      this.stats.incrementDropped();
      this.scheduleFrame();
      return;
    }

    // Capturar bitmap y enviar al worker
    createImageBitmap(this.video).then((bitmap) => {
      if (!this.running || !this.worker) {
        bitmap.close();
        return;
      }

      if (this.busy) {
        // Carrera: se volvió busy mientras creábamos el bitmap
        bitmap.close();
        this.stats.incrementDropped();
        this.scheduleFrame();
        return;
      }

      this.busy = true;
      this.lastFrameTime = now;
      const t = Date.now();
      this.worker.postMessage(
        { type: 'FRAME', bitmap, t },
        [bitmap],
      );
    }).catch(() => {
      // createImageBitmap puede fallar si el video no tiene frame aún
      this.scheduleFrame();
    });

    this.scheduleFrame();
  }

  private handleWorkerMessage(msg: FromWorkerMessage): void {
    if (msg.type === 'LANDMARKS') {
      this.busy = false;
      this.stats.push(msg.inferenceMs);

      if (this.recording) {
        this.recorder.record(msg);
      }

      const event: LandmarksEvent = {
        t: msg.t,
        landmarks: msg.landmarks,
        inferenceMs: msg.inferenceMs,
      };
      for (const fn of this.subscribers) {
        fn(event);
      }
    }

    if (msg.type === 'ERROR') {
      this.busy = false;
      if (import.meta.env.DEV) console.warn('[cam] worker ERROR:', msg.message);
    }
  }

  private cleanup(): void {
    if (this.video && this.callbackId !== null) {
      this.video.cancelVideoFrameCallback(this.callbackId);
      this.callbackId = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  private mapCameraError(err: unknown): PostureError {
    if (err instanceof DOMException) {
      switch (err.name) {
        case 'NotAllowedError':
          return { kind: 'CAMERA_DENIED' };
        case 'NotReadableError':
        case 'AbortError':
          return { kind: 'CAMERA_BUSY' };
      }
    }
    // Fallback genérico
    return { kind: 'CAMERA_DENIED' };
  }
}
