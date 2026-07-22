/** Formatea segundos como MM:SS (ej. 125 → "2:05") */
function formatMMSS(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface DayStatsProps {
  goodSecondsToday: number;
  avgScore: number;
  flowSeconds: number;
}

export function DayStats({ goodSecondsToday, avgScore, flowSeconds }: DayStatsProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Estadísticas del Día</h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-gray-400">Tiempo en buena postura</p>
          <p data-testid="day-stats-good-time" className="text-lg font-bold text-white">
            {formatMMSS(goodSecondsToday)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Score promedio</p>
          <p data-testid="day-stats-avg-score" className="text-lg font-bold text-white">
            {Math.round(avgScore)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Racha de flow</p>
          <p data-testid="day-stats-flow-streak" className="text-lg font-bold text-white">
            {formatMMSS(flowSeconds)}
          </p>
        </div>
      </div>
    </div>
  );
}
