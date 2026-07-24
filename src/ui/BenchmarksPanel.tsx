import { useAppStore } from '../store/useAppStore';

/**
 * Panel de rendimiento del pipeline. Muestra los FPS reales de frames que
 * llegan al store y el intervalo entre frames (p50/p95). A 5 FPS lo esperado
 * es ~5 FPS y ~200 ms de intervalo.
 */
export function BenchmarksPanel() {
  const perf = useAppStore((s) => s.perf);
  const isRunning = useAppStore((s) => s.isRunning);

  const cells = [
    { label: 'FPS reales', value: perf.fps, unit: '', color: 'text-blue-400' },
    { label: 'Intervalo p50', value: perf.p50, unit: 'ms', color: 'text-green-400' },
    { label: 'Intervalo p95', value: perf.p95, unit: 'ms', color: 'text-yellow-400' },
  ];

  return (
    <div className="w-full h-full min-h-[200px] bg-gray-900 rounded-lg p-4 flex flex-col gap-3">
      <h2 className="text-sm font-bold text-gray-300">Rendimiento</h2>
      {!isRunning ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-gray-500 text-xs">Inicia una fuente para ver métricas</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 flex-1 items-center">
          {cells.map((c) => (
            <div key={c.label} className="bg-gray-800 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-400">{c.label}</div>
              <div className={`text-2xl font-bold tabular-nums ${c.color}`}>
                {c.value}
                {c.unit && <span className="text-sm ml-0.5">{c.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
