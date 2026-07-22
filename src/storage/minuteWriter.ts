import type { PostureFrame } from '../contracts/posture';
import { createMinuteBuffer } from './minuteBuffer';
import { openSpineHeroDB } from './db';

export interface MinuteWriter {
  push(frame: PostureFrame): void;
  stop(): void;
}

/** Minuto actual del día (0-1439) a partir del reloj del sistema. */
function getCurrentMinute(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Inicia un escritor periódico que acumula PostureFrames en un buffer
 * y escribe a IndexedDB al cruzar un límite de minuto.
 *
 * Devuelve un objeto con `push` para alimentar frames y `stop` para
 * detener el timer y flush parcial.
 */
export function startMinuteWriter(): MinuteWriter {
  const buffer = createMinuteBuffer();
  let lastMinute = getCurrentMinute();

  const intervalId = setInterval(() => {
    const currentMinute = getCurrentMinute();
    if (currentMinute !== lastMinute) {
      lastMinute = currentMinute;
      flushAndWrite();
    }
  }, 1_000);

  async function flushAndWrite(): Promise<void> {
    const entry = buffer.flush();
    if (!entry) return;
    buffer.reset();
    try {
      const db = await openSpineHeroDB();
      await db.put('minutes', entry);
    } catch (err: unknown) {
      console.error('[minuteWriter] write failed:', err);
    }
  }

  return {
    push(frame: PostureFrame): void {
      buffer.push(frame);
    },
    stop(): void {
      clearInterval(intervalId);
      flushAndWrite();
    },
  };
}
