import type { Checkpoint } from '../contracts/sync';
import { buildCheckpoint } from './checkpointBuilder';
import { getDay, getProfile, getSyncedRecordId, setSyncedRecordId } from './db';
import { todayLocalDate } from './dateKey';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { ActiveIdentity } from './identityErrors';

type DataClient = ReturnType<typeof generateClient<Schema>>;

export interface SynchronizerDeps {
  /** Nick activo y su id, o null si no hay identidad. Inyectado por el store. */
  getIdentity: () => ActiveIdentity | null;
}

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

export function createSynchronizer(
  deps: SynchronizerDeps,
  config?: Partial<SynchronizerConfig>,
): Synchronizer {
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

  async function syncNow(): Promise<void> {
    // Guard: no enviar si no hay red
    if (!navigator.onLine) return;

    // Guard: no relanzar si ya hay un sync en curso (intervalo + flush, etc.)
    if (syncing) return;
    syncing = true;
    try {
      // Guard: sin identidad activa no se emite ninguna operación (Req 7.4, 14.8)
      const identity = deps.getIdentity();
      if (identity === null) return;

      const today = todayLocalDate();
      const minutes = await getDay(today);
      const profile = await getProfile();

      // Sin perfil no podemos construir checkpoint
      if (profile === null) return;

      const checkpoint: Checkpoint = buildCheckpoint(today, minutes, profile, profile.teamCode);

      // El Nick activo tal como está almacenado, sin recortes ni normalización (Req 7.1)
      const displayName = identity.nick;

      // `authMode` explícito: sin sesión de Cognito, las Credenciales_Invitado
      // son las únicas con las que el Sincronizador puede escribir (Req 13.2).
      const client = generateClient<Schema>({ authMode: 'identityPool' });

      // Retry con backoff exponencial. Un rechazo anti-trampa NO se reintenta:
      // los mismos números volverían a rechazarse (Req 13.13).
      for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
        try {
          await upsertDailyRecord(client, today, checkpoint, displayName);
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : '';
          if (message.includes(ANTICHEAT_REJECT_TOKEN)) return;

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
   * Upsert del DailyRecord del día exclusivamente a través de
   * `validateAndUpdateDailyRecord`: la Lambda es quien decide (rules.ts) y
   * quien persiste (create sin `id`, update con `id`). El cliente nunca llama
   * a `client.models.DailyRecord.create/update` directamente, así el
   * Validador_AntiTrampa cubre el 100% de las escrituras del Sincronizador.
   */
  async function upsertDailyRecord(
    client: DataClient,
    today: string,
    checkpoint: Checkpoint,
    displayName: string,
  ): Promise<void> {
    const existingId = await getSyncedRecordId(today);

    // Si hay un registro previo sincronizado, se envían también sus valores
    // previos para que el Validador_AntiTrampa pueda evaluar INCREMENT_VS_ELAPSED.
    let previousGoodPostureSeconds: number | undefined;
    let previousUpdatedAt: string | undefined;
    if (existingId) {
      try {
        const { data: current } = await client.models.DailyRecord.get({ id: existingId });
        if (current) {
          previousGoodPostureSeconds = current.goodPostureSeconds;
          previousUpdatedAt = current.updatedAt;
        }
      } catch {
        // Si el get falla, se envía la mutación sin valores previos: el
        // Validador_AntiTrampa simplemente no evalúa INCREMENT_VS_ELAPSED.
      }
    }

    const { data, errors } = await client.mutations.validateAndUpdateDailyRecord({
      id: existingId ?? undefined,
      date: checkpoint.date,
      displayName,
      goodPostureSeconds: checkpoint.goodPostureSeconds,
      previousGoodPostureSeconds,
      previousUpdatedAt,
      longestFlowStreak: checkpoint.longestFlowStreak,
      avgScore: checkpoint.avgScore,
      level: checkpoint.level,
      xp: checkpoint.xp,
      teamCode: checkpoint.teamCode,
    });

    if (isAntiCheatRejection(errors)) {
      throw new Error(`${ANTICHEAT_REJECT_TOKEN}: checkpoint rechazado por el servidor`);
    }
    if (errors?.length || !data?.id) {
      throw new Error('validateAndUpdateDailyRecord falló');
    }

    await setSyncedRecordId(today, data.id);
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
