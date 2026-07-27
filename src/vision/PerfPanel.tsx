import { useCallback, useEffect, useRef, useState } from 'react';
import type { PerfStats } from './perfStats';
import { usePerfStats } from './usePerfStats';
import { computeHealth, formatBenchmarkMarkdown, type HealthLevel } from './perfSnapshot';

interface PerfPanelProps {
  stats: PerfStats;
}

type CopyState = 'idle' | 'ok' | 'error';

/** Milisegundos que dura la confirmación visual de copiado. */
const COPY_FEEDBACK_MS = 2000;

/** Estilo del badge de salud por nivel. */
const HEALTH_UI: Record<HealthLevel, { label: string; dot: string; pulse: boolean }> = {
  IDLE: { label: '—', dot: 'bg-gray-500', pulse: false },
  HEALTHY: { label: 'HEALTHY', dot: 'bg-green-400', pulse: false },
  WARNING: { label: 'WARNING', dot: 'bg-yellow-400', pulse: true },
  CRITICAL: { label: 'CRITICAL', dot: 'bg-red-500', pulse: true },
};

function formatLine(label: string, value: string): string {
  return `${label.padEnd(10)} ${value}`;
}

/**
 * Copia texto al portapapeles con fallback a execCommand si la Clipboard API
 * no está disponible o falla (p. ej. contexto no seguro o sin permiso).
 * Devuelve true si se copió por alguna vía.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Cae al fallback de textarea + execCommand.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Panel de rendimiento estilo terminal.
 * Muestra badge de salud, p50, p95, FPS reales, frames descartados y heap.
 */
export function PerfPanel({ stats }: PerfPanelProps) {
  const snap = usePerfStats(stats);
  const health = computeHealth(snap);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    const markdown = formatBenchmarkMarkdown(snap, new Date().toISOString());
    const ok = await copyText(markdown);
    setCopyState(ok ? 'ok' : 'error');
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
  }, [snap]);

  // Limpieza del timer de confirmación al desmontar.
  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const ui = HEALTH_UI[health];
  const copyLabel =
    copyState === 'ok' ? '✓ ¡Copiado!' : copyState === 'error' ? '✗ Error' : 'Copiar';

  return (
    <div
      className="rounded-md border border-green-800 bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-green-400 select-none"
      aria-label="Panel de rendimiento"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${ui.dot} ${ui.pulse ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
        <span className="text-green-300" role="status" aria-label={`Salud: ${ui.label}`}>
          {ui.label}
        </span>
      </div>

      <pre className="m-0 whitespace-pre">
        {formatLine('p50', `${snap.p50.toFixed(1)} ms`)}{'\n'}
        {formatLine('p95', `${snap.p95.toFixed(1)} ms`)}{'\n'}
        {formatLine('FPS', `${snap.fps.toFixed(1)}`)}{'\n'}
        {formatLine('Dropped', `${snap.dropped}`)}{'\n'}
        {snap.heapMB !== null && formatLine('Heap', `${snap.heapMB.toFixed(1)} MB`)}
      </pre>

      <button
        type="button"
        onClick={handleCopy}
        className="mt-2 cursor-pointer rounded border border-green-700 bg-green-950 px-2 py-0.5 text-[10px] text-green-300 hover:bg-green-900 active:bg-green-800"
      >
        {copyLabel}
      </button>

      {/* Región de estado para lectores de pantalla: anuncia el resultado del
          copiado sin reanunciar el botón entero. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copyState === 'ok'
          ? 'Cifras copiadas al portapapeles'
          : copyState === 'error'
            ? 'No se pudo copiar'
            : ''}
      </span>
    </div>
  );
}
