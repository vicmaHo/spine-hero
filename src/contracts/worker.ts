export interface Landmark {
  x: number;
  y: number;
  z: number;          // presente pero NO se usa: ruidoso a distancia de escritorio
  visibility: number;
}

export type ToWorkerMessage =
  | { type: 'INIT'; wasmPath: string; modelPath: string }
  | { type: 'FRAME'; bitmap: ImageBitmap; t: number }
  | { type: 'STOP' };

export type FromWorkerMessage =
  | { type: 'READY' }
  | { type: 'LANDMARKS'; t: number; landmarks: Landmark[]; inferenceMs: number }
  | { type: 'ERROR'; message: string };

/** Índices de MediaPipe Pose que usamos. El resto se descartan. */
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
} as const;