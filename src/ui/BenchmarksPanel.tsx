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
    { label: 'FPS reales', value: perf.fps, unit: '', color: '#3d7ea6' },
    { label: 'Intervalo p50', value: perf.p50, unit: 'ms', color: '#4a7a30' },
    { label: 'Intervalo p95', value: perf.p95, unit: 'ms', color: '#9c7420' },
  ];

  return (
    <section className="rpg-panel px-4 pb-4 pt-7">
      <div className="absolute -top-3 left-3">
        <span className="rpg-ribbon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 19h3v-7H4v7zm6.5 0h3V5h-3v14zM17 19h3v-10h-3v10z" />
          </svg>
          RENDIMIENTO
        </span>
      </div>

      {!isRunning ? (
        <p className="py-2 text-center text-[12px] font-medium text-[#5c4128]">
          Inicia una fuente para ver métricas
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {cells.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border-2 border-[#c9ab74] bg-[rgba(255,255,255,0.36)] px-3 py-2.5 text-center"
              style={{ boxShadow: 'inset 0 2px 0 1px rgba(255,255,255,0.5), 0 3px 0 0 rgba(92,65,40,0.22)' }}
            >
              <div className="rpg-label">{c.label.toUpperCase()}</div>
              <div
                className="font-pixel mt-1.5 text-[17px] tabular-nums"
                style={{ color: c.color }}
              >
                {c.value}
                {c.unit && <span className="ml-0.5 text-[9px]">{c.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
