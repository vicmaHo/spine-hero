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
}

const DB_NAME = 'spinehero';
const DB_VERSION = 1;

export function openSpineHeroDB(): Promise<IDBPDatabase<SpineHeroDB>> {
  return openDB<SpineHeroDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('minutes', { keyPath: ['date', 'minute'] });
      db.createObjectStore('profile');
    },
  });
}
