import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { PostureError } from '../contracts/posture';

const ERROR_LABELS: Record<PostureError['kind'], string> = {
  CAMERA_DENIED: 'Cámara denegada',
  CAMERA_BUSY: 'Cámara ocupada',
  MODEL_LOAD_FAILED: 'Error al cargar modelo',
  NO_GPU: 'GPU no disponible',
};

export function ControlPanel() {
  const isRunning = useAppStore((s) => s.isRunning);
  const lastError = useAppStore((s) => s.lastError);
  const source = useAppStore((s) => s.source);
  const start = useAppStore((s) => s.start);
  const stop = useAppStore((s) => s.stop);
  const calibrate = useAppStore((s) => s.calibrate);
  const setSource = useAppStore((s) => s.setSource);

  const [isCalibrating, setIsCalibrating] = useState(false);

  const handleStart = async () => {
    await start();
  };

  const handleStop = () => {
    stop();
  };

  const handleCalibrate = async () => {
    setIsCalibrating(true);
    try {
      await calibrate();
    } finally {
      setIsCalibrating(false);
    }
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as 'mock' | 'real';
    setSource(value);
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-300">Panel de Control</h3>

      {/* Botones de acción */}
      <div className="flex gap-2">
        <button
          onClick={handleStart}
          disabled={isRunning}
          className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-500 transition-colors"
        >
          Iniciar
        </button>
        <button
          onClick={handleStop}
          disabled={!isRunning}
          className="px-3 py-1.5 rounded bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500 transition-colors"
        >
          Detener
        </button>
        <button
          onClick={handleCalibrate}
          disabled={isRunning || isCalibrating}
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
        >
          {isCalibrating ? 'Calibrando…' : 'Calibrar'}
        </button>
      </div>

      {/* Indicador de calibración */}
      {isCalibrating && (
        <p className="text-xs text-blue-400 animate-pulse">Calibración en progreso…</p>
      )}

      {/* Selector de fuente */}
      <div className="flex items-center gap-2">
        <label htmlFor="source-select" className="text-xs text-gray-400">
          Fuente:
        </label>
        <select
          id="source-select"
          value={source}
          onChange={handleSourceChange}
          disabled={isRunning}
          className="bg-gray-700 text-white text-xs rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <option value="mock">Mock</option>
          <option value="real" disabled>Cámara (No disponible)</option>
        </select>
      </div>

      {/* Error display */}
      {lastError && (
        <p className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
          Error: {ERROR_LABELS[lastError.kind]}
        </p>
      )}
    </div>
  );
}

export default ControlPanel;
