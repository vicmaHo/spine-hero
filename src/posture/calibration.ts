import type { Landmark } from '../contracts/worker';
import type { CalibrationBaseline } from '../contracts/posture';
import { computeRawMetrics } from './metrics';

export const CALIBRATION_DURATION_MS = 5000;
export const MIN_VALID_FRAMES = 15;
export const MIN_CALIBRATION_CONFIDENCE = 0.7;

export interface CalibrationCollector {
  push(landmarks: Landmark[], confidence: number, now: number): void;
  isComplete(now: number): boolean;
  isValid(): boolean;
  compute(): CalibrationBaseline;
  readonly validCount: number;
}

/** Calcula la mediana de un array de números. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function createCalibrationCollector(startTime: number): CalibrationCollector {
  const frames: { shoulderWidth: number; neckRatio: number; tilt: number; headTilt: number }[] = [];

  return {
    push(landmarks: Landmark[], confidence: number, _now: number): void {
      if (confidence < MIN_CALIBRATION_CONFIDENCE) return;
      frames.push(computeRawMetrics(landmarks));
    },

    isComplete(now: number): boolean {
      return now - startTime >= CALIBRATION_DURATION_MS;
    },

    isValid(): boolean {
      return frames.length >= MIN_VALID_FRAMES;
    },

    get validCount(): number {
      return frames.length;
    },

    compute(): CalibrationBaseline {
      if (frames.length < MIN_VALID_FRAMES) {
        throw new Error(
          `Calibración fallida: solo ${frames.length} frames válidos (mínimo ${MIN_VALID_FRAMES})`,
        );
      }

      return {
        shoulderWidth: median(frames.map((f) => f.shoulderWidth)),
        neckRatio: median(frames.map((f) => f.neckRatio)),
        tilt: median(frames.map((f) => f.tilt)),
        headTilt: median(frames.map((f) => f.headTilt)),
        capturedAt: startTime,
      };
    },
  };
}
