import type { PostureSource, PostureFrame, CalibrationBaseline } from '../contracts/posture';
import type { Landmark } from '../contracts/worker';
import { processLandmarks } from './pipeline';
import { createCalibrationCollector } from './calibration';
import { INITIAL_POSTURE_STATE, type PostureState } from './stateMachine';

/** Interfaz mínima del proveedor de landmarks (inyectado, no importado de vision/). */
export interface LandmarkSource {
  start(): Promise<void>;
  stop(): void;
  subscribe(fn: (event: { t: number; landmarks: Landmark[] }) => void): () => void;
}

/**
 * Crea una implementación de PostureSource que conecta un LandmarkSource
 * con el pipeline de postura (calibración + métricas + scoring + estado).
 *
 * Este es el único fichero en posture/ con estado mutable y suscripciones.
 * Toda la lógica pura se delega a pipeline.ts, calibration.ts y stateMachine.ts.
 */
export function createPostureSource(source: LandmarkSource): PostureSource {
  let baseline: CalibrationBaseline | null = null;
  let state: PostureState = INITIAL_POSTURE_STATE;
  let prevScore = 100;
  let subscribers = new Set<(frame: PostureFrame) => void>();
  let unsubFromSource: (() => void) | null = null;

  // Estado de calibración activa
  let calibrating = false;
  let calibrationCollector: ReturnType<typeof createCalibrationCollector> | null = null;
  let calibrationResolve: ((b: CalibrationBaseline) => void) | null = null;
  let calibrationReject: ((err: Error) => void) | null = null;

  function emit(frame: PostureFrame): void {
    for (const fn of subscribers) {
      fn(frame);
    }
  }

  function onLandmarks(event: { t: number; landmarks: Landmark[] }): void {
    const { t, landmarks } = event;

    if (calibrating && calibrationCollector) {
      // Durante calibración: alimentar el collector
      const confidence =
        landmarks.reduce((sum, lm) => sum + lm.visibility, 0) / landmarks.length;
      calibrationCollector.push(landmarks, confidence, t);

      // Emitir frame con status CALIBRATING para que la UI lo sepa
      const metrics = { neckRatio: 1, proximity: 1, tilt: 0, headTilt: 1 };
      emit({ t, status: 'CALIBRATING', score: prevScore, metrics, confidence });

      // Comprobar si se completó el tiempo de calibración
      if (calibrationCollector.isComplete(t)) {
        calibrating = false;
        if (calibrationCollector.isValid()) {
          baseline = calibrationCollector.compute();
          calibrationResolve?.(baseline);
        } else {
          calibrationReject?.(
            new Error(
              `Calibración fallida: solo ${calibrationCollector.validCount} frames válidos (mínimo 15). Repite la calibración.`,
            ),
          );
        }
        calibrationCollector = null;
        calibrationResolve = null;
        calibrationReject = null;
      }
      return;
    }

    if (!baseline) {
      // Sin baseline y sin calibrar: ignorar
      return;
    }

    // Pipeline normal: procesar landmarks con baseline
    const result = processLandmarks(landmarks, baseline, state, prevScore, t);
    state = result.nextState;
    prevScore = result.smoothedScore;
    emit(result.frame);
  }

  return {
    async start(): Promise<void> {
      await source.start();
      unsubFromSource = source.subscribe(onLandmarks);
    },

    stop(): void {
      if (unsubFromSource) {
        unsubFromSource();
        unsubFromSource = null;
      }
      source.stop();

      // Reiniciar estado
      baseline = null;
      state = INITIAL_POSTURE_STATE;
      prevScore = 100;
      calibrating = false;
      calibrationCollector = null;
      calibrationResolve = null;
      calibrationReject = null;
    },

    calibrate(): Promise<CalibrationBaseline> {
      return new Promise<CalibrationBaseline>((resolve, reject) => {
        // Usar Date.now() como startTime para el collector.
        // El tiempo real que determina "completo" viene del timestamp de los landmarks.
        const now = Date.now();
        calibrationCollector = createCalibrationCollector(now);
        calibrating = true;
        calibrationResolve = resolve;
        calibrationReject = reject;
      });
    },

    subscribe(fn: (frame: PostureFrame) => void): () => void {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
  };
}
