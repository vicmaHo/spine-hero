import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GameState } from '../contracts/game';
import type { CalibrationBaseline } from '../contracts/posture';

export interface MinuteEntry {
  date: string;            // YYYY-MM-DD
  minute: number;          // 0-1439
  avgScore: number;        // 0-100, integer
  dominantStatus: 'GOOD' | 'BAD';
  goodSeconds: number;     // 0-60
}

export interface ProfileRecord {
  gameState: GameState;
  calibration: CalibrationBaseline | null;
  teamCode?: string;       // código de sala para el ranking; opcional
}

/**
 * Mapea una fecha al id del DailyRecord ya creado en la nube para ese día.
 * Permite hacer upsert (update en vez de create) y no duplicar filas por día.
 * Es metadato de sincronización local: nunca sale del navegador.
 */
export interface SyncRecord {
  date: string;            // YYYY-MM-DD (keyPath)
  recordId: string;        // id del DailyRecord en AppSync/DynamoDB
}

export interface SpineHeroDB extends DBSchema {
  minutes: {
    key: [string, number]; // [date YYYY-MM-DD, minuteOfDay 0-1439]
    value: MinuteEntry;
  };
  profile: {
    key: string; // 'current'
    value: ProfileRecord;
  };
  sync: {
    key: string;           // date YYYY-MM-DD
    value: SyncRecord;
  };
}

const DB_NAME = 'spinehero';
const DB_VERSION = 2;

export function openSpineHeroDB(): Promise<IDBPDatabase<SpineHeroDB>> {
  return openDB<SpineHeroDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1: stores originales. No recrear si el usuario ya los tiene.
      if (oldVersion < 1) {
        db.createObjectStore('minutes', { keyPath: ['date', 'minute'] });
        db.createObjectStore('profile');
      }
      // v2: store de metadatos de sincronización (id del DailyRecord por día).
      if (oldVersion < 2) {
        db.createObjectStore('sync', { keyPath: 'date' });
      }
    },
  });
}

let dbPromise: Promise<IDBPDatabase<SpineHeroDB>> | null = null;

function getDB(): Promise<IDBPDatabase<SpineHeroDB>> {
  if (!dbPromise) {
    dbPromise = openSpineHeroDB();
  }
  return dbPromise;
}

/** Escribe una entrada de minuto en IndexedDB (put = upsert). */
export async function appendMinute(entry: MinuteEntry): Promise<void> {
  const db = await getDB();
  await db.put('minutes', entry);
}

/** Devuelve todas las entradas de un día dado (formato YYYY-MM-DD). */
export async function getDay(date: string): Promise<MinuteEntry[]> {
  const db = await getDB();
  // Rango: desde [date, 0] hasta [date, 1439]
  const range = IDBKeyRange.bound([date, 0], [date, 1439]);
  return db.getAll('minutes', range);
}

/** Lee el perfil guardado. Devuelve null si no existe. */
export async function getProfile(): Promise<ProfileRecord | null> {
  const db = await getDB();
  const record = await db.get('profile', 'current');
  return record ?? null;
}

/** Guarda (o sobreescribe) el perfil completo. */
export async function saveProfile(profile: ProfileRecord): Promise<void> {
  const db = await getDB();
  await db.put('profile', profile, 'current');
}

/**
 * Devuelve el id del DailyRecord ya sincronizado para `date`, o null si aún
 * no se ha creado ninguno ese día (primer sync → toca create).
 */
export async function getSyncedRecordId(date: string): Promise<string | null> {
  const db = await getDB();
  const rec = await db.get('sync', date);
  return rec?.recordId ?? null;
}

/** Registra el id del DailyRecord creado para `date` (para futuros updates). */
export async function setSyncedRecordId(date: string, recordId: string): Promise<void> {
  const db = await getDB();
  await db.put('sync', { date, recordId });
}
