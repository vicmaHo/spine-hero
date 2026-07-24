import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { VideoThumbnail } from './VideoThumbnail';
import { StatusIndicator } from './StatusIndicator';
import { AvatarCanvas } from './AvatarCanvas';
import { BenchmarksPanel } from './BenchmarksPanel';
import { SyncControl } from './SyncControl';
import { TeamCodeInput } from './TeamCodeInput';
import { RankingPanel } from './RankingPanel';
import type { PostureError } from '../contracts/posture';

const STATUS_BG: Record<string, string> = {
  GOOD: 'bg-green-500/20 border-green-500',
  BAD: 'bg-red-500/20 border-red-500',
  AWAY: 'bg-gray-500/20 border-gray-500',
  CALIBRATING: 'bg-amber-500/20 border-amber-500',
  LOW_CONF: 'bg-purple-500/20 border-purple-500',
};

const ERROR_LABELS: Record<PostureError['kind'], string> = {
  CAMERA_DENIED: 'Cámara denegada',
  CAMERA_BUSY: 'Cámara ocupada',
  MODEL_LOAD_FAILED: 'Error al cargar modelo',
  NO_GPU: 'GPU no disponible',
};

export function Dashboard() {
  const frame = useAppStore((s) => s.frame);
  const isRunning = useAppStore((s) => s.isRunning);
  const source = useAppStore((s) => s.source);
  const lastError = useAppStore((s) => s.lastError);
  const start = useAppStore((s) => s.start);
  const stop = useAppStore((s) => s.stop);
  const calibrate = useAppStore((s) => s.calibrate);
  const setSource = useAppStore((s) => s.setSource);

  const [isCalibrating, setIsCalibrating] = useState(false);

  const status = frame?.status ?? 'CALIBRATING';
  const score = frame ? Math.round(frame.score) : 0;
  const statusStyle = STATUS_BG[status] ?? STATUS_BG.CALIBRATING;

  const handleStart = async () => { await start(); };
  const handleStop = () => { stop(); };
  const handleCalibrate = async () => {
    setIsCalibrating(true);
    try { await calibrate(); } finally { setIsCalibrating(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 lg:p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-4 lg:gap-6">

        {/* ═══ Fila superior ═══ */}

        {/* Vídeo miniatura — arriba a la izquierda */}
        <div className="col-span-12 sm:col-span-4 lg:col-span-3">
          <VideoThumbnail />
        </div>

        {/* Score grande + indicador de estado — centro superior */}
        <div className={`col-span-12 sm:col-span-8 lg:col-span-5 rounded-xl border p-6 flex flex-col items-center justify-center gap-3 ${statusStyle}`}>
          <p className="text-6xl font-black tabular-nums leading-none">{score}</p>
          <StatusIndicator status={frame?.status ?? null} />
        </div>

        {/* Controles — arriba a la derecha */}
        <div className="col-span-12 lg:col-span-4 bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
          {/* Start / Stop */}
          <div className="flex gap-2">
            <button
              onClick={handleStart}
              disabled={isRunning}
              className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-500 transition-colors"
            >
              Iniciar
            </button>
            <button
              onClick={handleStop}
              disabled={!isRunning}
              className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-500 transition-colors"
            >
              Detener
            </button>
          </div>

          {/* Calibrar */}
          <button
            onClick={handleCalibrate}
            disabled={isCalibrating}
            className="w-full px-3 py-2 rounded-lg bg-blue-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
          >
            {isCalibrating ? 'Calibrando…' : 'Calibrar'}
          </button>
          {isCalibrating && (
            <p className="text-xs text-blue-400 animate-pulse text-center">Calibración en progreso…</p>
          )}

          {/* Selector de fuente */}
          <div className="flex items-center gap-2 mt-auto">
            <label htmlFor="source-select" className="text-xs text-gray-400">Fuente:</label>
            <select
              id="source-select"
              value={source}
              onChange={(e) => setSource(e.target.value as 'mock' | 'real')}
              disabled={isRunning}
              className="flex-1 bg-gray-800 text-white text-xs rounded-lg px-2 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed border border-gray-700"
            >
              <option value="mock">Mock (guion cíclico)</option>
              <option value="real" disabled>Cámara (No disponible)</option>
            </select>
          </div>

          {/* Error */}
          {lastError && (
            <p className="text-xs text-red-400 bg-red-900/30 rounded-lg px-3 py-1.5">
              Error: {ERROR_LABELS[lastError.kind]}
            </p>
          )}

          {/* Código de equipo + login opcional para sincronización */}
          <div className="border-t border-gray-800 pt-3 flex flex-col gap-3">
            <TeamCodeInput />
            <SyncControl />
          </div>
        </div>

        {/* ═══ Fila inferior: slots para integraciones día 3 ═══ */}

        {/* Canvas del avatar (M) */}
        <div className="col-span-12 lg:col-span-6">
          <AvatarCanvas />
        </div>

        {/* Panel de benchmarks (V) */}
        <div className="col-span-12 lg:col-span-6">
          <BenchmarksPanel />
        </div>

        {/* Ranking de equipo (C) */}
        <div className="col-span-12">
          <RankingPanel />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
