import { useEffect, useRef, useState, useCallback } from 'react';
import type { PerfStats } from './perfStats';

/** Intervalo de refresco del panel (ms). */
const REFRESH_INTERVAL_MS = 500;

interface PerfSnapshot {
  p50: number;
  p95: number;
  fps: number;
  dropped: number;
  heapMB: number | null;
}

interface PerfPanelProps {
  stats: PerfStats;
}

/** Devuelve el heap usado en MB si la API existe, o null. */
function readHeapMB(): number | null {
  // performance.memory es una extensión no estándar de Chrome/Edge
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (!mem) return null;
  return Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10;
}

function formatLine(label: string, value: string): string {
  return `${label.padEnd(10)} ${value}`;
}

/**
 * Panel de rendimiento estilo terminal.
 * Muestra p50, p95, FPS reales de inferencia, frames descartados y heap.
 */
export function PerfPanel({ stats }: PerfPanelProps) {
  const [snap, setSnap] = useState<PerfSnapshot>({
    p50: 0,
    p95: 0,
    fps: 0,
    dropped: 0,
    heapMB: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => {
      setSnap({
        p50: stats.getP50(),
        p95: stats.getP95(),
        fps: Math.round(stats.getFps() * 10) / 10,
        dropped: stats.getDropped(),
        heapMB: readHeapMB(),
      });
    };

    tick(); // lectura inicial
    intervalRef.current = setInterval(tick, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [stats]);

  const copyToClipboard = useCallback(() => {
    const lines = [
      '## Benchmark',
      '',
      '| Métrica | Valor |',
      '|---------|-------|',
      `| p50 | ${snap.p50.toFixed(1)} ms |`,
      `| p95 | ${snap.p95.toFixed(1)} ms |`,
      `| FPS inferencia | ${snap.fps} |`,
      `| Frames descartados | ${snap.dropped} |`,
      ...(snap.heapMB !== null ? [`| Heap usado | ${snap.heapMB} MB |`] : []),
      '',
      `_Capturado: ${new Date().toISOString()}_`,
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
  }, [snap]);

  return (
    <div
      className="rounded-md border border-green-800 bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-green-400 select-none"
      aria-label="Panel de rendimiento"
    >
      <pre className="m-0 whitespace-pre">
        {formatLine('p50', `${snap.p50.toFixed(1)} ms`)}{'\n'}
        {formatLine('p95', `${snap.p95.toFixed(1)} ms`)}{'\n'}
        {formatLine('FPS', `${snap.fps}`)}{'\n'}
        {formatLine('Dropped', `${snap.dropped}`)}{'\n'}
        {snap.heapMB !== null && formatLine('Heap', `${snap.heapMB} MB`)}
      </pre>
      <button
        type="button"
        onClick={copyToClipboard}
        className="mt-2 cursor-pointer rounded border border-green-700 bg-green-950 px-2 py-0.5 text-[10px] text-green-300 hover:bg-green-900 active:bg-green-800"
      >
        Copiar
      </button>
    </div>
  );
}
