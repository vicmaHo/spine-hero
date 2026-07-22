import { create } from 'zustand';
import type { PostureFrame, PostureSource, PostureError } from '../contracts/posture';
import type { GameState, GameEvent } from '../contracts/game';
import { INITIAL_GAME_STATE } from '../contracts/game';
import { tick } from '../game/engine';
import { loadProfile } from '../storage/profileStore';
import { scheduleProfileSave, flushNow } from '../storage/profileDebounce';
import { saveCalibration } from '../storage/profileStore';
import { startMinuteWriter } from '../storage/minuteWriter';
import type { MinuteWriter } from '../storage/minuteWriter';

type SourceType = 'camera' | 'mock' | 'replay';

interface AppState {
  // --- Estado expuesto ---
  currentFrame: PostureFrame | null;
  gameState: GameState;
  sourceType: SourceType;
  isMonitoring: boolean;
  lastError: PostureError | null;
  pendingEvents: GameEvent[];

  // --- Acciones ---
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
  swapSource: (source: PostureSource, type: SourceType) => boolean;
  calibrate: () => Promise<void>;

  // --- Internal ---
  _source: PostureSource | null;
  _unsubscribe: (() => void) | null;
  _minuteWriter: MinuteWriter | null;
  _setInitialProfile: (state: GameState) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // --- Estado inicial ---
  currentFrame: null,
  gameState: INITIAL_GAME_STATE,
  sourceType: 'mock',
  isMonitoring: false,
  lastError: null,
  pendingEvents: [],

  // --- Internal ---
  _source: null,
  _unsubscribe: null,
  _minuteWriter: null,

  _setInitialProfile: (state: GameState) => {
    set({ gameState: state });
  },

  // --- Acciones (stubs para 4.2/4.3/4.4) ---
  startMonitoring: async () => {
    const { _source } = get();
    if (!_source) return;

    try {
      await _source.start();
    } catch (err) {
      set({ lastError: err as PostureError, isMonitoring: false });
      return;
    }

    const writer = startMinuteWriter();

    const unsubscribe = _source.subscribe((frame) => {
      const { gameState, _minuteWriter } = get();
      const result = tick(gameState, frame, Date.now());

      // Persistencia: push al minute writer
      if (_minuteWriter) _minuteWriter.push(frame);

      // Persistencia: debounce profile save on gameState change
      if (result.state !== gameState) {
        scheduleProfileSave({ gameState: result.state, calibration: null });
      }

      set({
        currentFrame: frame,
        gameState: result.state,
        pendingEvents: result.events,
      });
    });

    set({ isMonitoring: true, lastError: null, _unsubscribe: unsubscribe, _minuteWriter: writer });
  },

  stopMonitoring: () => {
    const { _unsubscribe, _source, _minuteWriter } = get();
    if (_unsubscribe) _unsubscribe();
    if (_minuteWriter) _minuteWriter.stop();
    if (_source) _source.stop();
    flushNow();
    set({ isMonitoring: false, currentFrame: null, _unsubscribe: null, _minuteWriter: null });
  },

  swapSource: (source: PostureSource, type: SourceType): boolean => {
    // Se implementará en task 4.3
    if (get().isMonitoring) return false;
    set({ _source: source, sourceType: type });
    return true;
  },

  calibrate: async () => {
    const { _source } = get();
    if (!_source) return;
    const baseline = await _source.calibrate();
    await saveCalibration(baseline);
  },
}));

// Carga el perfil persistido al iniciar la app
loadProfile().then((record) => {
  if (record?.gameState) {
    useAppStore.getState()._setInitialProfile(record.gameState);
  }
});
