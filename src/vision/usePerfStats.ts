import { useEffect, useRef, useState } from 'react';
import type { PerfStats } from './perfStats';
import { EMPTY_SNAPSHOT, type PerfSnapshot } from './perfSnapshot';

/** Intervalo de refresco del panel (ms). */
export const REFRESH_INTERVAL_MS = 500;

/** Heap usado en MB si performance.memory existe (Chrome/Edge), o null. */
export function readHeapMB(): number | null {
  // performance.memory es una extensión no estándar de Chrome/Edge.
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (!mem) return null;
  return Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10;
}

/**
 * Sondea un PerfStats a intervalo fijo y devuelve la instantánea actual.
 * Pausa el sondeo cuando la pestaña no está visible (document.hidden) para no
 * gastar CPU en segundo plano, y lo reanuda al volver a primer plano.
 */
export function usePerfStats(
  stats: PerfStats,
  intervalMs: number = REFRESH_INTERVAL_MS,
): PerfSnapshot {
  const [snap, setSnap] = useState<PerfSnapshot>(EMPTY_SNAPSHOT);
  const prevDropped = useRef(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const dropped = stats.getDropped();
      const droppedDelta = Math.max(0, dropped - prevDropped.current);
      prevDropped.current = dropped;
      setSnap({
        p50: stats.getP50(),
        p95: stats.getP95(),
        fps: Math.round(stats.getFps() * 10) / 10,
        dropped,
        droppedDelta,
        heapMB: readHeapMB(),
      });
    };

    const startPolling = () => {
      if (intervalId !== null) return;
      // Baseline de descartados para que el primer delta tras (re)anudar sea 0
      // y no falsee un CRITICAL al arrancar o al volver de segundo plano.
      prevDropped.current = stats.getDropped();
      tick();
      intervalId = setInterval(tick, intervalMs);
    };

    const stopPolling = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };

    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [stats, intervalMs]);

  return snap;
}
