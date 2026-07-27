/**
 * Decisión del Validador_AntiTrampa: veredicto + persistencia, sin la
 * conexión real a AppSync.
 *
 * Separado de handler.ts porque handler.ts tiene efectos de nivel superior
 * (`Amplify.configure`, `generateClient`) y depende del módulo virtual
 * `$amplify/env/antiCheatValidator`, que solo resuelve dentro de la Lambda o
 * de `ampx sandbox`. Ese import de nivel superior hace que handler.ts no se
 * pueda cargar en Vitest/Node. Este módulo aísla la lógica pura para poder
 * testearla con un `DailyRecordWriter` en memoria.
 */

import { validateWrite, type CheckpointClaim } from './rules';

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Token con el que se prefijan los mensajes de rechazo. Es el contrato con el
 * cliente: solo si el mensaje lo lleva se trata como trampa real; cualquier
 * otro error (mutación no desplegada, permisos, red) es fallo de
 * infraestructura y no debe bloquear la sincronización.
 */
export const ANTICHEAT_REJECT_TOKEN = 'ANTICHEAT_REJECT';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Campos del DailyRecord que persiste el handler tras un veredicto aceptado. */
export interface DailyRecordFields {
  date: string;
  displayName: string;
  goodPostureSeconds: number;
  longestFlowStreak?: number | null;
  avgScore?: number | null;
  level?: number | null;
  xp?: number | null;
  teamCode?: string | null;
}

export interface DailyRecordWriteResult {
  id: string;
  date: string;
  goodPostureSeconds: number;
}

/**
 * Punto de persistencia que necesita `handleValidatedUpdate`. La Lambda real
 * lo implementa sobre `client.models.DailyRecord`; los tests, con un doble en
 * memoria (`fakeDailyRecordWriter`).
 */
export interface DailyRecordWriter {
  create(fields: DailyRecordFields): Promise<DailyRecordWriteResult>;
  update(id: string, fields: DailyRecordFields): Promise<DailyRecordWriteResult>;
}

export interface ValidatedUpdateArgs {
  id?: string | null;
  date: string;
  displayName: string;
  goodPostureSeconds: number;
  previousGoodPostureSeconds?: number | null;
  previousUpdatedAt?: string | null;
  longestFlowStreak?: number | null;
  avgScore?: number | null;
  level?: number | null;
  xp?: number | null;
  teamCode?: string | null;
}

// ─── Decisión (veredicto + persistencia) ───────────────────────────────────────

/**
 * Evalúa el veredicto anti-trampa y, si acepta, persiste el DailyRecord con el
 * `writer` recibido. Si rechaza, lanza sin invocar al `writer`.
 */
export async function handleValidatedUpdate(
  args: ValidatedUpdateArgs,
  writer: DailyRecordWriter,
  receivedAtMs: number,
): Promise<DailyRecordWriteResult> {
  const {
    id,
    date,
    displayName,
    goodPostureSeconds,
    previousGoodPostureSeconds,
    previousUpdatedAt,
    longestFlowStreak,
    avgScore,
    level,
    xp,
    teamCode,
  } = args;

  const claim: CheckpointClaim = {
    date,
    goodPostureSeconds,
    longestFlowStreak: longestFlowStreak ?? 0,
    avgScore: avgScore ?? 0,
    level: level ?? 1,
    xp: xp ?? 0,
    previousGoodPostureSeconds,
    previousUpdatedAt,
  };

  const verdict = validateWrite(claim, receivedAtMs);

  if (!verdict.ok) {
    throw new Error(`${ANTICHEAT_REJECT_TOKEN}: ${verdict.message}`);
  }

  const fields: DailyRecordFields = {
    date,
    displayName,
    goodPostureSeconds,
    longestFlowStreak,
    avgScore,
    level,
    xp,
    teamCode,
  };

  if (id) {
    return writer.update(id, fields);
  }

  return writer.create(fields);
}
