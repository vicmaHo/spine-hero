import { useState, useEffect, useRef, useCallback } from 'react';
import { createMockPostureSource } from './contracts/mockSource';
import type { PostureSource, PostureFrame } from './contracts/posture';

type SourceType = 'mock' | 'real';

/** Colores asociados a cada estado de postura */
const STATUS_COLORS: Record<string, string> = {
  GOOD: '#22c55e',
  BAD: '#ef4444',
  AWAY: '#6b7280',
  CALIBRATING: '#f59e0b',
  LOW_CONF: '#a855f7',
};

function App() {
  const [sourceType, setSourceType] = useState<SourceType>('mock');
  const [frame, setFrame] = useState<PostureFrame | null>(null);
  const [running, setRunning] = useState(false);
  const sourceRef = useRef<PostureSource | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setRunning(false);
    setFrame(null);
  }, []);

  // Limpiar al desmontar
  useEffect(() => cleanup, [cleanup]);

  const handleStart = useCallback(async () => {
    cleanup();

    let source: PostureSource;
    if (sourceType === 'mock') {
      source = createMockPostureSource();
    } else {
      // Por ahora, la fuente real no está implementada → aviso en consola
      // y usamos el mock como fallback
      // TODO: conectar fuente real cuando esté lista
      source = createMockPostureSource();
    }

    sourceRef.current = source;
    unsubRef.current = source.subscribe(setFrame);
    await source.start();
    setRunning(true);
  }, [sourceType, cleanup]);

  const handleStop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-bold">SpineHero — Monitor de Postura</h1>

      {/* Selector de fuente */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-400">Fuente:</label>
        <select
          value={sourceType}
          onChange={(e) => {
            cleanup();
            setSourceType(e.target.value as SourceType);
          }}
          disabled={running}
          className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-white disabled:opacity-50"
          aria-label="Seleccionar fuente de postura"
        >
          <option value="mock">Mock (guion cíclico)</option>
          <option value="real">Real (cámara)</option>
        </select>

        {!running ? (
          <button
            type="button"
            onClick={handleStart}
            className="bg-green-600 hover:bg-green-700 px-4 py-1.5 rounded font-medium transition-colors"
          >
            Iniciar
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStop}
            className="bg-red-600 hover:bg-red-700 px-4 py-1.5 rounded font-medium transition-colors"
          >
            Detener
          </button>
        )}
      </div>

      {/* Panel de estado */}
      {frame && (
        <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md space-y-4 border border-gray-700">
          {/* Estado actual */}
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Estado:</span>
            <span
              className="text-2xl font-bold px-3 py-1 rounded"
              style={{
                color: STATUS_COLORS[frame.status] ?? '#fff',
                backgroundColor: `${STATUS_COLORS[frame.status] ?? '#fff'}20`,
              }}
            >
              {frame.status}
            </span>
          </div>

          {/* Score */}
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Score:</span>
              <span className="font-mono">{frame.score.toFixed(1)}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className="h-3 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.max(0, Math.min(100, frame.score))}%`,
                  backgroundColor: STATUS_COLORS[frame.status] ?? '#fff',
                }}
              />
            </div>
          </div>

          {/* Confidence */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Confianza:</span>
            <span className="font-mono">{(frame.confidence * 100).toFixed(0)}%</span>
          </div>

          {/* Métricas */}
          <div className="border-t border-gray-700 pt-3 space-y-1">
            <p className="text-xs text-gray-500 mb-2">Métricas</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-400">neckRatio:</span>
              <span className="font-mono text-right">{frame.metrics.neckRatio.toFixed(3)}</span>
              <span className="text-gray-400">proximity:</span>
              <span className="font-mono text-right">{frame.metrics.proximity.toFixed(3)}</span>
              <span className="text-gray-400">tilt:</span>
              <span className="font-mono text-right">{frame.metrics.tilt.toFixed(3)} rad</span>
              <span className="text-gray-400">headTilt:</span>
              <span className="font-mono text-right">{frame.metrics.headTilt.toFixed(3)}</span>
            </div>
          </div>
        </div>
      )}

      {!running && !frame && (
        <p className="text-gray-500 text-sm">
          Selecciona una fuente y pulsa «Iniciar» para ver los estados de postura en tiempo real.
        </p>
      )}
    </div>
  );
}

export default App;
