/**
 * Web Worker de tipo módulo para inferencia de MediaPipe PoseLandmarker.
 * Protocolo: ToWorkerMessage → FromWorkerMessage (src/contracts/worker.ts).
 *
 * Assets servidos desde /public: nunca desde CDN.
 */

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { ToWorkerMessage, FromWorkerMessage, Landmark } from '../contracts/worker';
import { LM } from '../contracts/worker';

let landmarker: PoseLandmarker | null = null;

/** Índices que extraemos del resultado de MediaPipe (solo 5). */
const USED_INDICES = [LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER];

function post(msg: FromWorkerMessage): void {
  self.postMessage(msg);
}

async function handleInit(wasmPath: string, modelPath: string): Promise<void> {
  try {
    // Segundo argumento `true` indica que use la variante ES module (_module_)
    // necesaria para workers de tipo módulo donde importScripts() no funciona.
    const vision = await FilesetResolver.forVisionTasks(wasmPath, true);
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    post({ type: 'READY' });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    post({ type: 'ERROR', message: detail });
  }
}

function handleFrame(bitmap: ImageBitmap, t: number): void {
  if (!landmarker) {
    post({ type: 'ERROR', message: 'Landmarker no inicializado' });
    bitmap.close();
    return;
  }

  const t0 = performance.now();
  try {
    const result = landmarker.detectForVideo(bitmap, t);
    const inferenceMs = performance.now() - t0;

    if (!result.landmarks || result.landmarks.length === 0) {
      // Sin persona detectada: devolvemos landmarks vacíos
      post({ type: 'LANDMARKS', t, landmarks: [], inferenceMs });
      return;
    }

    // Extraemos solo los 5 landmarks que usamos
    const poseLandmarks = result.landmarks[0];
    const filtered: Landmark[] = USED_INDICES.map((idx) => ({
      x: poseLandmarks[idx].x,
      y: poseLandmarks[idx].y,
      z: poseLandmarks[idx].z,
      visibility: poseLandmarks[idx].visibility ?? 0,
    }));

    post({ type: 'LANDMARKS', t, landmarks: filtered, inferenceMs });
  } finally {
    bitmap.close();
  }
}

function handleStop(): void {
  if (landmarker) {
    landmarker.close();
    landmarker = null;
  }
}

self.onmessage = (e: MessageEvent<ToWorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'INIT':
      void handleInit(msg.wasmPath, msg.modelPath);
      break;
    case 'FRAME':
      handleFrame(msg.bitmap, msg.t);
      break;
    case 'STOP':
      handleStop();
      break;
  }
};
