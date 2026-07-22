import { create } from 'zustand';
import type { PostureFrame, CalibrationBaseline, PostureError } from '../contracts/posture';
import type { GameState } from '../contracts/game';
import { INITIAL_GAME_STATE } from '../contracts/game';
import { createMockPostureSource } from '../contracts/mockSource';
// TODO: integración M — reemplazar stub cuando el módulo esté listo
import { tick } from '../game/engine';
import { loadProfile } from '../storage/profileStore';
import { scheduleProfileSave, flushNow } from '../storage/profileDebounce';
import { saveCalibration } from '../storage/profileStore';
import { startMinuteWriter } from '../storage/minuteWriter';
import type { MinuteWriter } from '../storage/minuteWriter';

type SourceType = 'real' | 'mock';

interface PerfStats {
  p50: number;
  p95: number;
  fps: number;
}

interface AppState {
  // --- Estado expuesto ---
  source: SourceType;
  frame: PostureFrame | null;
  game: GameState;
  calibration: CalibrationBaseline | null;
  perf: PerfStats;
  isRunning: boolean;
  lastError: PostureError | null;

  // --- Acciones ---
  setSource: (type: SourceType) => void;
  start: () => Promise<void>;
  stop: () => void;
  calibrate: () => Promise<void>;
  pushFrame: (frame: PostureFrame) => void;
}

// --- Internal (fuera del estado expuesto para no serializar) ---
let _unsubscribe: (() => void) | null = null;
let _minuteWriter: MinuteWriter | null = null;
let _sourceInstance: { start(): Promise<void>; stop(): void; calibrate(): Promise<CalibrationBaseline>; subscribe(fn: (f: PostureFrame) => void): () => void } | null = null;

// Tracking para cálculo de perf
let _frameTimes: number[] = [];
const PERF_WINDOW = 60; // últimos 60 frames para p50/p95

function computePerf(): PerfStats {
  if (_frameTimes.length < 2) return { p50: 0, p95: 0, fps: 0 };

  const deltas: number[] = [];
  for (let i = 1; i < _frameTimes.length; i++) {
    deltas.push(_frameTimes[i] - _frameTimes[i - 1]);
  }
  deltas.sort((a, b) => a - b);

  const p50 = deltas[Math.floor(deltas.length * 0.5)] ?? 0;
  const p95 = deltas[Math.floor(deltas.length * 0.95)] ?? 0;

  // FPS basado en ventana temporal real
  const elapsed = _frameTimes[_frameTimes.length - 1] - _frameTimes[0];
  const fps = elapsed > 0 ? Math.round((_frameTimes.length - 1) / (elapsed / 1000)) : 0;

  return { p50: Math.round(p50), p95: Math.round(p95), fps };
}

export const useAppStore = create<AppState>((set, get) => ({
  // --- Estado inicial ---
  source: 'mock',
  frame: null,
  game: INITIAL_GAME_STATE,
  calibration: null,
  perf: { p50: 0, p95: 0, fps: 0 },
  isRunning: false,
  lastError: null,

  // --- Acciones ---

  setSource: (type: SourceType) => {
    if (get().isRunning) return; // no cambiar fuente mientras corre
    set({ source: type });
  },

  start: async () => {
    const { source, isRunning } = get();
    if (isRunning) return;

    // Instanciar la fuente según el tipo seleccionado
    if (source === 'mock') {
      _sourceInstance = createMockPostureSource();
    } else {
      // TODO: instanciar fuente real cuando esté disponible
      // Por ahora fallback a mock
      _sourceInstance = createMockPostureSource();
    }

    try {
      await _sourceInstance.start();
    } catch (err) {
      set({ lastError: err as PostureError, isRunning: false });
      _sourceInstance = null;
      return;
    }

    // Iniciar minute writer para persistencia
    _minuteWriter = startMinuteWriter();
    _frameTimes = [];

    // Suscribirse a frames
    _unsubscribe = _sourceInstance.subscribe((frame) => {
      get().pushFrame(frame);
    });

    set({ isRunning: true, lastError: null });
  },

  stop: () => {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
    if (_minuteWriter) {
      _minuteWriter.stop();
      _minuteWriter = null;
    }
    if (_sourceInstance) {
      _sourceInstance.stop();
      _sourceInstance = null;
    }
    flushNow();
    _frameTimes = [];
    set({ isRunning: false, frame: null, perf: { p50: 0, p95: 0, fps: 0 } });
  },

  calibrate: async () => {
    if (!_sourceInstance) return;
    const baseline = await _sourceInstance.calibrate();
    await saveCalibration(baseline);
    set({ calibration: baseline });
  },

  pushFrame: (frame: PostureFrame) => {
    const { game } = get();

    // Motor de juego — el store solo orquesta, no contiene lógica
    // TODO: integración M — tick(game, frame) es la API final
    const result = tick(game, frame, Date.now());

    // Persistencia: minute writer
    if (_minuteWriter) _minuteWriter.push(frame);

    // Persistencia: profile debounce si cambió el game state
    if (result.state !== game) {
      scheduleProfileSave({ gameState: result.state, calibration: get().calibration });
    }

    // Perf tracking
    _frameTimes.push(frame.t);
    if (_frameTimes.length > PERF_WINDOW) {
      _frameTimes = _frameTimes.slice(-PERF_WINDOW);
    }

    set({
      frame,
      game: result.state,
      perf: computePerf(),
    });
  },
}));

// Carga el perfil persistido al iniciar la app
loadProfile().then((record) => {
  if (record) {
    useAppStore.setState({
      game: record.gameState,
      calibration: record.calibration,
    });
  }
});
