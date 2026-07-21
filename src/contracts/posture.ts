export type PostureStatus =
  | 'CALIBRATING'
  | 'GOOD'
  | 'BAD'
  | 'AWAY'
  | 'LOW_CONF';

export interface PostureMetrics {
  /** (yHombros - yOrejas) / shoulderWidth. Baja al encorvarse. */
  neckRatio: number;
  /** shoulderWidth actual / shoulderWidth de calibración. >1 = te acercas. */
  proximity: number;
  /** Radianes. Desnivel entre hombros. */
  tilt: number;
  /** Desviación vertical de la nariz respecto al punto medio de las orejas. */
  headTilt: number;
}

export interface CalibrationBaseline {
  shoulderWidth: number;
  neckRatio: number;
  tilt: number;
  headTilt: number;
  capturedAt: number;
}

export interface PostureFrame {
  /** Date.now() del frame de vídeo original. */
  t: number;
  status: PostureStatus;
  /** 0-100, ya suavizado con EMA. */
  score: number;
  metrics: PostureMetrics;
  /** 0-1. Media de visibility de los landmarks clave. */
  confidence: number;
}

export interface PostureSource {
  start(): Promise<void>;
  stop(): void;
  calibrate(): Promise<CalibrationBaseline>;
  /** Devuelve la función para cancelar la suscripción. */
  subscribe(fn: (frame: PostureFrame) => void): () => void;
}

export type PostureError =
  | { kind: 'CAMERA_DENIED' }
  | { kind: 'CAMERA_BUSY' }
  | { kind: 'MODEL_LOAD_FAILED'; detail: string }
  | { kind: 'NO_GPU'; fallback: 'cpu' };