import type { Checkpoint } from '../contracts/sync';
import { buildCheckpoint } from './checkpointBuilder';
import { getDay, getProfile, getSyncedRecordId, setSyncedRecordId } from './db';
import { todayLocalDate } from './dateKey';
import { computeStreakUpdate } from './streakCalculator';
import type { StreakState } from './streakCalculator';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';

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

/**
 * Token que el validador anti-trampa del backend prefija en sus mensajes.
 * Debe coincidir con ANTICHEAT_REJECT_TOKEN de
 * amplify/data/anti-cheat-handler/handler.ts (se replica aquí para no importar
 * código de backend en el bundle del cliente).
 */
export const ANTICHEAT_REJECT_TOKEN = 'ANTICHEAT_REJECT';

interface GraphQLLikeError {
  message?: string | null;
}

/**
 * Distingue rechazo real de fallo de infraestructura: solo es rechazo si algún
 * mensaje lleva el token. Un error sin token (mutación no desplegada, no
 * autorizado, red) NO debe impedir la sincronización.
 */
export function isAntiCheatRejection(
  errors: readonly GraphQLLikeError[] | null | undefined,
): boolean {
  if (!errors || errors.length === 0) return false;
  return errors.some(
    (e) => typeof e.message === 'string' && e.message.includes(ANTICHEAT_REJECT_TOKEN),
  );
}

/** Espera `ms` milisegundos. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Valida el checkpoint contra el servidor antes de persistir el update. Los
 * valores previos vienen del servidor (nunca de datos locales, que el usuario
 * podría manipular).
 *
 * Fail-safe: lanza SOLO si el backend rechaza por anti-trampa. Cualquier fallo
 * de infraestructura se ignora para no bloquear la sincronización.
 */
async function assertNotCheating(
  client: DataClient,
  existingId: string,
  checkpoint: Checkpoint,
): Promise<void> {
  let rejected = false;

  try {
    const { data: current } = await client.models.DailyRecord.get({ id: existingId });
    // Sin registro en la nube no hay incremento que validar
    if (!current) return;

    const { errors } = await client.mutations.validateAndUpdateDailyRecord({
      id: existingId,
      date: checkpoint.date,
      goodPostureSeconds: checkpoint.goodPostureSeconds,
      previousGoodPostureSeconds: current.goodPostureSeconds,
      previousUpdatedAt: current.updatedAt,
      longestFlowStreak: checkpoint.longestFlowStreak,
      avgScore: checkpoint.avgScore,
      level: checkpoint.level,
      xp: checkpoint.xp,
      teamCode: checkpoint.teamCode,
    });

    rejected = isAntiCheatRejection(errors);

    if (!rejected && errors?.length && import.meta.env.DEV) {
      console.warn('[sync] validación anti-trampa no disponible, se persiste igual:', errors);
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[sync] validación anti-trampa no ejecutada:', err);
    return;
  }

  // Fuera del try para que el rechazo legítimo se propague y aborte el update.
  if (rejected) {
    throw new Error(`${ANTICHEAT_REJECT_TOKEN}: checkpoint rechazado por el servidor`);
  }
}

export function createSynchronizer(config?: Partial<SynchronizerConfig>): Synchronizer {
  const cfg: SynchronizerConfig = { ...DEFAULT_CONFIG, ...config };

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let started = false;
  // Evita solapes: intervalo, reconexión y flush al ocultar pueden coincidir.
  let syncing = false;

  const onOnline = (): void => {
    void syncNow();
  };

  // Flush best-effort al ocultar la pestaña (cambio de pestaña, minimizar o
  // cierre): sube el tramo acumulado antes de que se pause/mate la página.
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') void syncNow();
  };
  const onPageHide = (): void => {
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

    // Guard: no relanzar si ya hay un sync en curso (intervalo + flush, etc.)
    if (syncing) return;
    syncing = true;
    try {
      // Guard: no enviar si no hay sesión autenticada
      if (!(await isAuthenticated())) return;

      const today = todayLocalDate();
      const minutes = await getDay(today);
      const profile = await getProfile();

      // Sin perfil no podemos construir checkpoint
      if (profile === null) return;

      const checkpoint: Checkpoint = buildCheckpoint(today, minutes, profile, profile.teamCode);

      // Obtener displayName del usuario (email como fallback legible)
      let displayName: string | undefined;
      try {
        const attrs = await fetchUserAttributes();
        displayName = attrs.email ?? undefined;
      } catch {
        // Si falla, no bloqueamos el sync
      }

      const client = generateClient<Schema>();

      // Retry con backoff exponencial
      for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
        try {
          await upsertDailyRecord(client, today, checkpoint, displayName);

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
    } finally {
      syncing = false;
    }
  }

  /**
   * Upsert del DailyRecord del día: si ya existe un id sincronizado para hoy,
   * lo ACTUALIZA; si no, lo CREA y guarda su id para futuros updates. Así un
   * mismo día no genera múltiples filas (que inflarían el ranking).
   */
  async function upsertDailyRecord(
    client: DataClient,
    today: string,
    checkpoint: Checkpoint,
    displayName: string | undefined,
  ): Promise<void> {
    const existingId = await getSyncedRecordId(today);

    if (existingId) {
      await assertNotCheating(client, existingId, checkpoint);

      const { errors } = await client.models.DailyRecord.update({
        id: existingId,
        ...checkpoint,
        displayName,
      });
      if (errors?.length) throw new Error('DailyRecord.update falló');
      return;
    }

    const { data, errors } = await client.models.DailyRecord.create({
      ...checkpoint,
      displayName,
    });
    if (errors?.length || !data?.id) throw new Error('DailyRecord.create falló');
    await setSyncedRecordId(today, data.id);
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
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    // Primer sync inmediato al arrancar (típicamente justo tras el login),
    // en vez de esperar al primer tick del intervalo (5 min).
    void syncNow();
  }

  function stop(): void {
    if (!started) return;
    started = false;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', onPageHide);
  }

  return { start, stop, syncNow };
}
