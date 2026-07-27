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
  /**
   * id del UserIdentity dueño de ese DailyRecord.
   *
   * Sin él, el mapa fecha → recordId es común a todas las identidades del
   * navegador: tras «Cambiar de usuario», el Sincronizador del nick nuevo
   * reutilizaría el recordId del anterior y la mutación haría un `update` con
   * el `displayName` nuevo, renombrando la fila del ranking del nick anterior y
   * quedándose con sus segundos.
   *
   * Opcional porque los registros escritos antes de este campo no lo tienen; se
   * aceptan como propios (entonces solo había una identidad por navegador).
   */
  userIdentityId?: string;
}

/**
 * Almacen_Local_Identidad: nick activo y el id de su registro UserIdentity.
 * Nunca contiene el Correo_Vinculado (Requisito 9 criterio 8).
 */
export interface LocalIdentityRecord {
  nick: string;            // tal como está almacenado en UserIdentity
  userIdentityId: string;  // id inmutable del registro remoto
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
  identity: {
    key: string;            // 'current'
    value: LocalIdentityRecord;
  };
}

const DB_NAME = 'spinehero';
const DB_VERSION = 3;

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
      // v3: Almacen_Local_Identidad. Solo crea el store nuevo: minutes,
      // profile y sync quedan intactos (Requisitos 5.4 y 12.7).
      if (oldVersion < 3) {
        db.createObjectStore('identity');
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
 * Devuelve el id del DailyRecord que `userIdentityId` ya sincronizó para
 * `date`, o null si aún no hay ninguno suyo ese día (primer sync → toca
 * create).
 *
 * Devolver null cuando el registro guardado pertenece a otra identidad es lo
 * que impide que un nick escriba sobre la fila de otro (ver `SyncRecord`).
 */
export async function getSyncedRecordId(
  date: string,
  userIdentityId: string,
): Promise<string | null> {
  const db = await getDB();
  const rec = await db.get('sync', date);
  if (!rec) return null;
  if (rec.userIdentityId !== undefined && rec.userIdentityId !== userIdentityId) return null;
  return rec.recordId;
}

/** Registra el id del DailyRecord creado para `date` por `userIdentityId`. */
export async function setSyncedRecordId(
  date: string,
  recordId: string,
  userIdentityId: string,
): Promise<void> {
  const db = await getDB();
  await db.put('sync', { date, recordId, userIdentityId });
}

/** Lee el Almacen_Local_Identidad. Devuelve null si no existe. */
export async function getLocalIdentityRecord(): Promise<LocalIdentityRecord | null> {
  const db = await getDB();
  const record = await db.get('identity', 'current');
  return record ?? null;
}

/** Guarda (o sobreescribe) el Almacen_Local_Identidad completo. */
export async function saveLocalIdentityRecord(record: LocalIdentityRecord): Promise<void> {
  const db = await getDB();
  await db.put('identity', record, 'current');
}

/** Elimina el Almacen_Local_Identidad («Cambiar de usuario»). */
export async function clearLocalIdentityRecord(): Promise<void> {
  const db = await getDB();
  await db.delete('identity', 'current');
}

/**
 * Vacía los datos locales del usuario en el cierre de sesión: identidad,
 * minutos del día y perfil (GameState, calibración y teamCode).
 *
 * Deja el navegador como recién instalado para que la siguiente persona no
 * herede XP, nivel, racha, minutos ni —sobre todo— una calibración hecha con
 * otro cuerpo. No toca el registro `UserIdentity` remoto, así que el nick que
 * cerró sesión vuelve a entrar con «Ya tengo nick» (Req 4.5).
 *
 * **`sync` se conserva a propósito.** No es progreso: es el puntero
 * fecha → id del DailyRecord ya creado en la nube. Borrarlo hacía que el mismo
 * nick, al reentrar el mismo día, no encontrara su fila y creara otra, dejando
 * varias filas suyas en el ranking e incumpliendo el Req 7.7. El puntero lleva
 * el `userIdentityId` de su dueño (ver `SyncRecord`), así que conservarlo no
 * filtra nada a la siguiente persona: a otra identidad `getSyncedRecordId` le
 * devuelve null igualmente.
 *
 * Los tres `clear()` van en una única transacción: o se borra todo o no se
 * borra nada, sin estados intermedios en los que la identidad esté fuera pero
 * el progreso siga dentro.
 */
export async function clearAllLocalUserData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['identity', 'minutes', 'profile'], 'readwrite');
  await Promise.all([
    tx.objectStore('identity').clear(),
    tx.objectStore('minutes').clear(),
    tx.objectStore('profile').clear(),
    tx.done,
  ]);
}
