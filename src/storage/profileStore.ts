import type { GameState } from '../contracts/game';
import { INITIAL_GAME_STATE } from '../contracts/game';
import type { CalibrationBaseline } from '../contracts/posture';
import { openSpineHeroDB } from './db';

export interface ProfileRecord {
  gameState: GameState;
  calibration: CalibrationBaseline | null;
}

const PROFILE_KEY = 'current';

/**
 * Lee el perfil almacenado en IndexedDB.
 * Devuelve null si no existe o si ocurre un error.
 */
export async function loadProfile(): Promise<ProfileRecord | null> {
  try {
    const db = await openSpineHeroDB();
    const record = await db.get('profile', PROFILE_KEY);
    return record ?? null;
  } catch (err) {
    console.error('[profileStore] loadProfile failed:', err);
    return null;
  }
}

/**
 * Escribe el perfil completo en IndexedDB con clave 'current'.
 * En caso de error, lo registra sin lanzar excepción.
 */
export async function saveProfile(record: ProfileRecord): Promise<void> {
  try {
    const db = await openSpineHeroDB();
    await db.put('profile', record, PROFILE_KEY);
  } catch (err) {
    console.error('[profileStore] saveProfile failed:', err);
  }
}

/**
 * Guarda la calibración de forma inmediata (sin debounce).
 * Si no existe un perfil previo, crea uno con INITIAL_GAME_STATE.
 */
export async function saveCalibration(baseline: CalibrationBaseline): Promise<void> {
  try {
    const db = await openSpineHeroDB();
    const existing = await db.get('profile', PROFILE_KEY);
    const record: ProfileRecord = {
      gameState: existing?.gameState ?? INITIAL_GAME_STATE,
      calibration: baseline,
    };
    await db.put('profile', record, PROFILE_KEY);
  } catch (err) {
    console.error('[profileStore] saveCalibration failed:', err);
  }
}
