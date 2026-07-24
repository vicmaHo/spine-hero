import type { Checkpoint } from '../contracts/sync';
import { buildCheckpoint } from './checkpointBuilder';
import { getDay, getProfile } from './db';
import { computeStreakUpdate } from './streakCalculator';
import type { StreakState } from './streakCalculator';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { fetchAuthSession } from 'aws-amplify/auth';

type DataClient = ReturnType<typeof generateClient<Schema>>;

export interface SynchronizerConfig {
  intervalMs: number;        // 300_000 (5 min)
  maxRetries: number;        // 3
  baseRetryMs: number;       // 1_000
}

export interface Synchronizer {
  start(): void;
  stop(): void;
  syncNow(): Promise<void>;
}

const DEFAULT_CONFIG: SynchronizerConfig = {
  intervalMs: 300_000,
  maxRetries: 3,
  baseRetryMs: 1_000,
};

/** Devuelve la fecha actual en formato YYYY-MM-DD. */
function todayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Espera `ms` milisegundos. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSynchronizer(config?: Partial<SynchronizerConfig>): Synchronizer {
  const cfg: SynchronizerConfig = { ...DEFAULT_CONFIG, ...config };

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let started = false;

  const onOnline = (): void => {
    void syncNow();
  };

  async function isAuthenticated(): Promise<boolean> {
    try {
      const session = await fetchAuthSession();
      return session.tokens !== undefined;
    } catch {
      return false;
    }
  }

  async function syncNow(): Promise<void> {
    // Guard: no enviar si no hay red
    if (!navigator.onLine) return;

    // Guard: no enviar si no hay sesión autenticada
    if (!(await isAuthenticated())) return;

    const today = todayDate();
    const minutes = await getDay(today);
    const profile = await getProfile();

    // Sin perfil no podemos construir checkpoint
    if (profile === null) return;

    const checkpoint: Checkpoint = buildCheckpoint(today, minutes, profile, profile.teamCode);

    const client = generateClient<Schema>();

    // Retry con backoff exponencial
    for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
      try {
        await client.models.DailyRecord.create(checkpoint);

        // Sync exitoso: actualizar streak
        await syncStreak(client, today);
        return;
      } catch {
        // Si aún quedan reintentos, esperar con backoff
        if (attempt < cfg.maxRetries - 1) {
          const backoffMs = cfg.baseRetryMs * Math.pow(2, attempt);
          await delay(backoffMs);
        }
        // Último intento agotado: descartar silenciosamente
      }
    }
  }

  async function syncStreak(client: DataClient, today: string): Promise<void> {
    try {
      // Obtener streak existente del usuario
      const { data: streaks } = await client.models.Streak.list();
      const existing: StreakState | null = streaks.length > 0
        ? {
            currentDays: streaks[0].currentDays as number,
            bestDays: streaks[0].bestDays as number,
            lastActiveDate: streaks[0].lastActiveDate as string,
          }
        : null;

      const updated = computeStreakUpdate(existing, today);

      if (streaks.length > 0) {
        await client.models.Streak.update({
          id: streaks[0].id as string,
          ...updated,
        });
      } else {
        await client.models.Streak.create(updated);
      }
    } catch {
      // Error en streak no bloquea el flujo principal
    }
  }

  function start(): void {
    if (started) return;
    started = true;
    intervalId = setInterval(() => { void syncNow(); }, cfg.intervalMs);
    window.addEventListener('online', onOnline);
  }

  function stop(): void {
    if (!started) return;
    started = false;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    window.removeEventListener('online', onOnline);
  }

  return { start, stop, syncNow };
}
