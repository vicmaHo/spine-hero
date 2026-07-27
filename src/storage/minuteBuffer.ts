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
  /**
   * Fecha y minuto del primer frame acumulado, es decir el minuto que estas
   * medidas describen.
   *
   * Se captura al empezar a acumular y no al hacer flush porque `minuteWriter`
   * vuelca justo *después* de cruzar el límite de minuto: leer el reloj en
   * `flush()` etiquetaba cada entrada con el minuto siguiente al que había
   * medido. Además de desplazar todos los datos un minuto (y de atribuir al día
   * siguiente lo acumulado en el último minuto de la noche), hacía que un flush
   * a mitad de minuto —el de `stop()`— escribiera bajo la misma clave que la
   * entrada anterior y la sobrescribiera, porque `db.put` es un upsert.
   */
  let measuredAt: { date: string; minute: number } | null = null;

  return {
    push(frame: PostureFrame): void {
      if (!QUALIFYING_STATUSES.has(frame.status as 'GOOD' | 'BAD')) return;

      if (measuredAt === null) {
        const now = new Date();
        measuredAt = { date: formatDate(now), minute: now.getHours() * 60 + now.getMinutes() };
      }

      scores.push(frame.score);
      if (frame.status === 'GOOD') {
        goodCount++;
      } else {
        badCount++;
      }
    },

    flush(): MinuteEntry | null {
      if (scores.length === 0 || measuredAt === null) return null;

      const { date, minute } = measuredAt;

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
      measuredAt = null;
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
