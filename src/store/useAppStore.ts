import { create } from 'zustand';
import type { PostureFrame, CalibrationBaseline, PostureError } from '../contracts/posture';
import type { Landmark } from '../contracts/worker';
import type { GameState } from '../contracts/game';
import { INITIAL_GAME_STATE } from '../contracts/game';
import { createMockPostureSource } from '../contracts/mockSource';
import { CameraSource } from '../vision/cameraSource';
import { createPostureSource, type LandmarkSource } from '../posture/postureSource';
import { tick } from '../game/engine';
import { loadProfile } from '../storage/profileStore';
import { scheduleProfileSave, flushNow } from '../storage/profileDebounce';
import { saveCalibration, saveProfile } from '../storage/profileStore';
import { startMinuteWriter } from '../storage/minuteWriter';
import type { MinuteWriter } from '../storage/minuteWriter';
import { createSynchronizer } from '../storage/synchronizer';
import type { Synchronizer } from '../storage/synchronizer';

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
  isAuthenticated: boolean;
  teamCode: string | null;
  videoStream: MediaStream | null;      // stream de la cámara en modo real (para preview)
  calibrationError: string | null;      // mensaje si la calibración falla
  latestLandmarks: Landmark[];          // últimos landmarks (modo real) para el overlay

  // --- Acciones ---
  setSource: (type: SourceType) => void;
  setTeamCode: (code: string | null) => void;
  start: () => Promise<void>;
  stop: () => void;
  calibrate: () => Promise<void>;
  pushFrame: (frame: PostureFrame) => void;
  onAuthReady: () => void;
  onAuthLost: () => void;
  syncNow: () => Promise<void>;
}

// --- Internal (fuera del estado expuesto para no serializar) ---
let _unsubscribe: (() => void) | null = null;
let _minuteWriter: MinuteWriter | null = null;
let _synchronizer: Synchronizer | null = null;
let _sourceInstance: { start(): Promise<void>; stop(): void; calibrate(): Promise<CalibrationBaseline>; subscribe(fn: (f: PostureFrame) => void): () => void } | null = null;
let _landmarksUnsub: (() => void) | null = null;

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
  isAuthenticated: false,
  teamCode: null,
  videoStream: null,
  calibrationError: null,
  latestLandmarks: [],

  // --- Acciones ---

  setSource: (type: SourceType) => {
    if (get().isRunning) return; // no cambiar fuente mientras corre
    set({ source: type });
  },

  setTeamCode: (code: string | null) => {
    // Normalizado a mayúsculas: la partition key del ranking es case-sensitive,
    // así lo guardado y lo consultado coinciden siempre.
    const normalized = code === null ? null : code.trim().toUpperCase();
    set({ teamCode: normalized });
    // Persistir de inmediato en el perfil: sobrevive a recargas y el
    // synchronizer lo lee de IndexedDB para escribirlo en cada DailyRecord.
    void saveProfile({
      gameState: get().game,
      calibration: get().calibration,
      teamCode: normalized ?? undefined,
    });
  },

  start: async () => {
    const { source, isRunning } = get();
    if (isRunning) return;

    // Instanciar la fuente según el tipo seleccionado
    let camera: CameraSource | null = null;
    if (source === 'mock') {
      _sourceInstance = createMockPostureSource();
    } else {
      // Fuente real: cámara + worker de V (LandmarkSource) → pipeline de postura de V.
      // El adaptador traduce el Result de CameraSource.start() a la interfaz
      // LandmarkSource, que espera lanzar el PostureError si la cámara falla.
      camera = new CameraSource();
      const cam = camera;
      const adapter: LandmarkSource = {
        async start() {
          const result = await cam.start();
          if (!result.ok) throw result.error;
        },
        stop() { cam.stop(); },
        subscribe(fn) {
          return cam.subscribe((e) => fn({ t: e.t, landmarks: e.landmarks }));
        },
      };
      _sourceInstance = createPostureSource(adapter);
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

    // Suscripción extra solo para el overlay de landmarks (modo real).
    if (camera) {
      _landmarksUnsub = camera.subscribe((e) => {
        useAppStore.setState({ latestLandmarks: e.landmarks });
      });
    }

    set({
      isRunning: true,
      lastError: null,
      videoStream: camera ? camera.getStream() : null,
    });
  },

  stop: () => {
    if (_unsubscribe) {
      _unsubscribe();
      _unsubscribe = null;
    }
    if (_landmarksUnsub) {
      _landmarksUnsub();
      _landmarksUnsub = null;
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
    set({ isRunning: false, frame: null, perf: { p50: 0, p95: 0, fps: 0 }, videoStream: null, latestLandmarks: [] });
  },

  calibrate: async () => {
    if (!_sourceInstance) return;
    set({ calibrationError: null });
    try {
      // Red de seguridad: si la fuente nunca resuelve (p. ej. la cámara no
      // entrega datos), no dejamos "Calibrando…" colgado para siempre.
      const baseline = await Promise.race([
        _sourceInstance.calibrate(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 8000),
        ),
      ]);
      await saveCalibration(baseline);
      set({ calibration: baseline });
    } catch (err) {
      const raw = (err as Error).message;
      const msg = raw === 'TIMEOUT'
        ? 'La calibración no recibió datos suficientes en 8 s. Comprueba que la cámara te detecta (deberías ver los puntos sobre el vídeo).'
        : raw ?? 'Calibración fallida';
      set({ calibrationError: msg });
    }
  },

  pushFrame: (frame: PostureFrame) => {
    const { game } = get();

    // Motor de juego — el store solo orquesta, no contiene lógica
    const result = tick(game, frame, Date.now());

    // Persistencia: minute writer
    if (_minuteWriter) _minuteWriter.push(frame);

    // Persistencia: profile debounce si cambió el game state
    if (result.state !== game) {
      scheduleProfileSave({
        gameState: result.state,
        calibration: get().calibration,
        teamCode: get().teamCode ?? undefined,   // no sobrescribir el código al guardar
      });
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

  onAuthReady: () => {
    _synchronizer = createSynchronizer();
    _synchronizer.start();
    set({ isAuthenticated: true });
  },

  onAuthLost: () => {
    _synchronizer?.stop();
    _synchronizer = null;
    set({ isAuthenticated: false });
  },

  // Fuerza un checkpoint inmediato (para verificación/manual; el automático es cada 5 min).
  syncNow: async () => {
    await _synchronizer?.syncNow();
  },
}));

// Carga el perfil persistido al iniciar la app
loadProfile().then((record) => {
  if (record) {
    useAppStore.setState({
      game: record.gameState,
      calibration: record.calibration,
      teamCode: record.teamCode ?? null,
    });
  }
});
