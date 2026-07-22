import type { ReactNode } from 'react';
import { ControlPanel } from './ControlPanel';
import { VideoThumbnail } from './VideoThumbnail';
import { useAppStore } from '../store/useAppStore';
import { StatusIndicator, ScoreBar } from './StatusIndicator';
import { DayStats } from './DayStats';

export interface DashboardProps {
  avatarCanvas?: ReactNode;
  benchmarksPanel?: ReactNode;
}

export function Dashboard({ avatarCanvas, benchmarksPanel }: DashboardProps) {
  const currentFrame = useAppStore((s) => s.currentFrame);
  const gameState = useAppStore((s) => s.gameState);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Columna izquierda: estado + controles */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Indicador de estado + barra de score */}
          <div className="bg-gray-800 rounded-lg p-4 flex flex-col gap-3">
            <StatusIndicator status={currentFrame?.status ?? null} />
            <ScoreBar score={currentFrame?.score ?? null} />
          </div>

          {/* Miniatura de vídeo */}
          <VideoThumbnail />

          {/* Estadísticas del día */}
          <DayStats
            goodSecondsToday={gameState.goodSecondsToday}
            avgScore={0}
            flowSeconds={gameState.flowSeconds}
          />

          {/* Panel de control */}
          <div className="bg-gray-800 rounded-lg p-4">
            <ControlPanel />
          </div>
        </div>

        {/* Columna derecha: slots */}
        <div className="flex flex-col gap-4">

          {/* Slot: Avatar Canvas */}
          <div
            data-testid="slot-avatar-canvas"
            className="bg-gray-800 rounded-lg p-4 flex items-center justify-center"
            style={{ minWidth: 256, minHeight: 256 }}
          >
            {avatarCanvas ?? (
              <span className="text-gray-500 text-sm">Avatar Canvas</span>
            )}
          </div>

          {/* Slot: Benchmarks Panel */}
          <div
            data-testid="slot-benchmarks-panel"
            className="bg-gray-800 rounded-lg p-4 flex items-center justify-center"
            style={{ minWidth: 320, minHeight: 200 }}
          >
            {benchmarksPanel ?? (
              <span className="text-gray-500 text-sm">Benchmarks Panel</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
