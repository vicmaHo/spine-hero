import type { FromWorkerMessage, Landmark } from '../contracts/worker';

/** Entrada grabada de una sesión de landmarks. */
export interface RecordedFrame {
  t: number;
  landmarks: Landmark[];
  inferenceMs: number;
}

/**
 * Graba mensajes LANDMARKS del worker para exportar como fixture JSON.
 * Solo almacena mensajes de tipo LANDMARKS; ignora READY y ERROR.
 */
export class LandmarkRecorder {
  private buffer: RecordedFrame[] = [];

  /** Registra un mensaje del worker. Solo almacena LANDMARKS. */
  record(msg: FromWorkerMessage): void {
    if (msg.type !== 'LANDMARKS') return;
    this.buffer.push({
      t: msg.t,
      landmarks: msg.landmarks,
      inferenceMs: msg.inferenceMs,
    });
  }

  /** Exporta la sesión grabada como JSON string. */
  export(): string {
    return JSON.stringify(this.buffer, null, 2);
  }

  /** Devuelve el buffer actual (sin copiar). */
  getFrames(): readonly RecordedFrame[] {
    return this.buffer;
  }

  /** Número de frames grabados. */
  get length(): number {
    return this.buffer.length;
  }

  /** Vacía el buffer. */
  clear(): void {
    this.buffer = [];
  }
}
