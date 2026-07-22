import type { PostureFrame } from '../contracts/posture';

export interface MinuteEntry {
  date: string;          // YYYY-MM-DD
  minute: number;        // 0-1439
  avgScore: number;      // 0-100, integer
  dominantStatus: 'GOOD' | 'BAD';
  goodSeconds: number;   // 0-60
}

export interface MinuteBuffer {
  push(frame: PostureFrame): void;
  flush(): MinuteEntry | null;
  reset(): void;
}

/** Statuses que se acumulan en el buffer (el resto se ignoran). */
const QUALIFYING_STATUSES = new Set(['GOOD', 'BAD'] as const);

/**
 * Crea un acumulador in-memory que recolecta PostureFrames dentro de un minuto
 * y produce un MinuteEntry al hacer flush.
 */
export function createMinuteBuffer(): MinuteBuffer {
  let scores: number[] = [];
  let goodCount = 0;
  let badCount = 0;

  return {
    push(frame: PostureFrame): void {
      if (!QUALIFYING_STATUSES.has(frame.status as 'GOOD' | 'BAD')) return;

      scores.push(frame.score);
      if (frame.status === 'GOOD') {
        goodCount++;
      } else {
        badCount++;
      }
    },

    flush(): MinuteEntry | null {
      if (scores.length === 0) return null;

      const now = new Date();
      const date = formatDate(now);
      const minute = now.getHours() * 60 + now.getMinutes();

      const avgScore = Math.round(
        scores.reduce((sum, s) => sum + s, 0) / scores.length
      );

      // BAD gana en empate
      const dominantStatus: 'GOOD' | 'BAD' =
        goodCount > badCount ? 'GOOD' : 'BAD';

      // 5 FPS → 5 frames GOOD = 1 segundo
      const goodSeconds = Math.min(Math.floor(goodCount / 5), 60);

      return { date, minute, avgScore, dominantStatus, goodSeconds };
    },

    reset(): void {
      scores = [];
      goodCount = 0;
      badCount = 0;
    },
  };
}

/** Formatea una Date como YYYY-MM-DD. */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
