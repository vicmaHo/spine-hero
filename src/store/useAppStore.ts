import { create } from 'zustand';
import type { PostureFrame, CalibrationBaseline, PostureError } from '../contracts/posture';
import type { Landmark } from '../contracts/worker';
import type { GameState, GameEvent } from '../contracts/game';
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
import { loadLocalIdentity } from '../storage/identityLocal';
import { clearAllLocalUserData } from '../storage/db';
import { createIdentityService } from '../storage/identityService';
import { createRealIdentityClient, ensureGuestSession } from '../storage/identityClient';
import type { ActiveIdentity, IdentityError } from '../storage/identityErrors';
import { identityErrorMessage } from './identityMessages';

type SourceType = 'real' | 'mock';

// Plazo máximo de la lectura del Almacen_Local_Identidad al arrancar
// (Requisito 4 criterio 7): si no resuelve en este tiempo, se presenta el
// Formulario_Acceso sin borrar el contenido local.
const IDENTITY_BOOTSTRAP_TIMEOUT_MS = 3_000;

export type IdentityPhase = 'loading' | 'form' | 'granted' | 'guest';
export type NickFormMode = 'signIn' | 'signUp';

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
  lastEvents: GameEvent[];              // últimos eventos emitidos por tick()
  calibration: CalibrationBaseline | null;
  perf: PerfStats;
  isRunning: boolean;
  lastError: PostureError | null;
  teamCode: string | null;
  videoStream: MediaStream | null;      // stream de la cámara en modo real (para preview)
  calibrationError: string | null;      // mensaje si la calibración falla
  latestLandmarks: Landmark[];          // últimos landmarks (modo real) para el overlay

  // --- Slice de identidad (Sistema_Identidad) ---
  identity: ActiveIdentity | null;      // único campo con el Nick activo (Req 4.3)
  identityPhase: IdentityPhase;
  identityBusy: boolean;                // «Comprobando…» (Req 8.3)
  identityMessage: string | null;       // ya traducido a español
  identityMessageField: 'nick' | 'email' | 'both' | null;
  emailTakenNick: string | null;        // habilita «Entrar con ese nick» (Req 3.3)
  localSaveFailed: boolean;             // aviso no bloqueante (Req 4.8)

  // --- Acciones ---
  setSource: (type: SourceType) => void;
  setTeamCode: (code: string | null) => void;
  start: () => Promise<void>;
  stop: () => void;
  calibrate: () => Promise<void>;
  pushFrame: (frame: PostureFrame) => void;
  syncNow: () => Promise<void>;

  bootstrapIdentity: () => Promise<void>;
  signUpNick: (nick: string, email: string) => Promise<void>;
  signInNick: (nick: string, email: string) => Promise<void>;
  changeNick: (nick: string) => Promise<void>;
  switchUser: () => Promise<void>;      // «Cambiar de usuario»
  continueWithoutNick: () => void;
  openNickForm: () => void;             // «Elegir nick»
}

// --- Internal (fuera del estado expuesto para no serializar) ---
let _unsubscribe: (() => void) | null = null;
let _minuteWriter: MinuteWriter | null = null;
let _synchronizer: Synchronizer | null = null;
let _sourceInstance: { start(): Promise<void>; stop(): void; calibrate(): Promise<CalibrationBaseline>; subscribe(fn: (f: PostureFrame) => void): () => void } | null = null;
let _landmarksUnsub: (() => void) | null = null;

/**
 * Traduce un `IdentityError` a su mensaje en español y, si es un fallo opaco
 * para el usuario, deja su causa en la consola.
 *
 * `BACKEND` y `TIMEOUT` comparten un único mensaje genérico (Req 8.7), así que
 * sin esta traza el `detail` —el error real de AppSync— se pierde y el fallo es
 * indepurable desde el navegador.
 */
function identityMessageWithTrace(error: IdentityError) {
  if (error.kind === 'BACKEND') console.error('[identity] fallo de backend:', error.detail);
  if (error.kind === 'TIMEOUT') console.error('[identity] se agotó el plazo de la operación');
  return identityErrorMessage(error);
}

/**
 * Arranca (o reinicia) el Sincronizador con la identidad activa del store.
 * `getIdentity` lee el estado en vivo, así que no hace falta reiniciarlo
 * cuando `changeNick` actualiza `identity`: la próxima sincronización ya lo
 * recoge sin volver a llamar a esta función.
 */
function startSynchronizerForIdentity(): void {
  _synchronizer?.stop();
  _synchronizer = createSynchronizer({ getIdentity: () => useAppStore.getState().identity });
  _synchronizer.start();
  void _synchronizer.syncNow(); // checkpoint inmediato (Req 7.5: ≤10 s desde la concesión)
}

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
  // La interfaz ya no ofrece selector de fuente: la cámara real es el único
  // camino del usuario. `setSource` y la fuente falsa siguen existiendo para
  // los tests y para volver a exponer el selector si hiciera falta.
  source: 'real',
  frame: null,
  game: INITIAL_GAME_STATE,
  lastEvents: [],
  calibration: null,
  perf: { p50: 0, p95: 0, fps: 0 },
  isRunning: false,
  lastError: null,
  teamCode: null,
  videoStream: null,
  calibrationError: null,
  latestLandmarks: [],

  identity: null,
  identityPhase: 'loading',
  identityBusy: false,
  identityMessage: null,
  identityMessageField: null,
  emailTakenNick: null,
  localSaveFailed: false,

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
      lastEvents: result.events,
      perf: computePerf(),
    });
  },

  // Fuerza un checkpoint inmediato (para verificación/manual; el automático es cada 5 min).
  syncNow: async () => {
    await _synchronizer?.syncNow();
  },

  // --- Slice de identidad ---

  bootstrapIdentity: async () => {
    set({ identityPhase: 'loading' });

    // Antes de cualquier operación contra el Sistema_Data: un navegador que usó
    // el login de Cognito retirado en Req 14.7 seguiría presentando
    // credenciales del rol autenticado, que los modelos de identidad no
    // autorizan. Se hace aquí y no en `main.tsx` porque este es el único camino
    // por el que se llega al Formulario_Acceso, así que ningún envío puede
    // adelantarse a la limpieza.
    await ensureGuestSession();

    let result;
    try {
      result = await Promise.race([
        loadLocalIdentity(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('IDENTITY_BOOTSTRAP_TIMEOUT')), IDENTITY_BOOTSTRAP_TIMEOUT_MS),
        ),
      ]);
    } catch {
      // Fallo o plazo agotado (Req 4.7): mostrar el formulario sin borrar
      // el contenido del Almacen_Local_Identidad.
      set({ identityPhase: 'form' });
      return;
    }

    if (result.ok && result.value !== null) {
      set({ identity: result.value, identityPhase: 'granted' });
      startSynchronizerForIdentity();
      return;
    }

    // Sin nick guardado (result.ok con value null) o lectura fallida
    // (result.ok === false): en ambos casos se pasa al formulario sin tocar
    // el Almacen_Local_Identidad (Req 4.7).
    set({ identityPhase: 'form' });
  },

  signUpNick: async (nick: string, email: string) => {
    set({ identityBusy: true, identityMessage: null, identityMessageField: null, emailTakenNick: null });

    const result = await createIdentityService(createRealIdentityClient()).signUp(nick, email);

    if (result.ok) {
      // El servicio ya intentó guardar localmente; se verifica de forma
      // independiente porque `signUp` no expone si esa escritura tuvo éxito
      // (Req 4.8: no revoca el acceso, solo se avisa).
      const localCheck = await loadLocalIdentity();
      const localSaveFailed = !(localCheck.ok && localCheck.value?.userIdentityId === result.value.userIdentityId);

      set({
        identity: result.value,
        identityPhase: 'granted',
        identityBusy: false,
        identityMessage: null,
        identityMessageField: null,
        emailTakenNick: null,
        localSaveFailed,
      });
      startSynchronizerForIdentity();
      return;
    }

    const message = identityMessageWithTrace(result.error);
    set({
      identityBusy: false,
      identityMessage: message.text,
      identityMessageField: message.field,
      emailTakenNick: result.error.kind === 'EMAIL_TAKEN' ? result.error.nick : null,
    });
  },

  signInNick: async (nick: string, email: string) => {
    set({ identityBusy: true, identityMessage: null, identityMessageField: null });

    const result = await createIdentityService(createRealIdentityClient()).signIn(nick, email);

    if (result.ok) {
      const localCheck = await loadLocalIdentity();
      const localSaveFailed = !(localCheck.ok && localCheck.value?.userIdentityId === result.value.userIdentityId);

      set({
        identity: result.value,
        identityPhase: 'granted',
        identityBusy: false,
        identityMessage: null,
        identityMessageField: null,
        localSaveFailed,
      });
      startSynchronizerForIdentity();
      return;
    }

    const message = identityMessageWithTrace(result.error);
    set({
      identityBusy: false,
      identityMessage: message.text,
      identityMessageField: message.field,
    });
  },

  changeNick: async (nick: string) => {
    const current = get().identity;
    if (current === null) return; // defensivo: no debería invocarse sin identidad activa

    set({ identityBusy: true, identityMessage: null, identityMessageField: null });

    const result = await createIdentityService(createRealIdentityClient()).changeNick(current, nick);

    if (result.ok) {
      const localCheck = await loadLocalIdentity();
      const localSaveFailed = !(localCheck.ok && localCheck.value?.userIdentityId === result.value.userIdentityId);

      // No toca `game`, `calibration` ni `teamCode` (Req 5.4): solo se
      // actualiza la identidad y los campos de mensaje.
      set({
        identity: result.value,
        identityBusy: false,
        identityMessage: null,
        identityMessageField: null,
        localSaveFailed,
      });
      return;
    }

    // El nick anterior permanece como identidad activa (Req 5.7): no se
    // toca `identity`, solo se reporta el fallo.
    const message = identityMessageWithTrace(result.error);
    set({
      identityBusy: false,
      identityMessage: message.text,
      identityMessageField: message.field,
    });
  },

  switchUser: async () => {
    // El orden importa. `stop()` hace un `flushNow()` que persiste el perfil
    // pendiente, así que primero se para (y se escribe lo que quedara), después
    // se borra, y solo entonces se reinicia el estado en memoria. Al revés, el
    // primer frame posterior al borrado volvería a guardar el GameState viejo
    // por el debounce de `pushFrame`.
    if (get().isRunning) get().stop();

    _synchronizer?.stop();
    _synchronizer = null;

    await clearAllLocalUserData();

    set({
      // Identidad fuera: vuelta al Formulario_Acceso (Req 4.4).
      identity: null,
      identityPhase: 'form',
      identityMessage: null,
      identityMessageField: null,
      emailTakenNick: null,
      localSaveFailed: false,
      // Progreso en memoria a su valor inicial, en la misma acción que borra
      // IndexedDB: si no, la interfaz seguiría mostrando el XP y el nivel de
      // quien acaba de salir.
      game: INITIAL_GAME_STATE,
      calibration: null,
      calibrationError: null,
      teamCode: null,
      frame: null,
    });
  },

  continueWithoutNick: () => {
    set({ identityPhase: 'guest' });
  },

  openNickForm: () => {
    set({ identityPhase: 'form' });
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
