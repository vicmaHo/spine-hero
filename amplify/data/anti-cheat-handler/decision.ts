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
/** Lo que se necesita saber de una fila ya persistida para no empeorarla. */
export interface ExistingDailyRecord {
  id: string;
  goodPostureSeconds: number;
  longestFlowStreak?: number | null;
  level?: number | null;
  xp?: number | null;
}

export interface DailyRecordWriter {
  create(fields: DailyRecordFields): Promise<DailyRecordWriteResult>;
  update(id: string, fields: DailyRecordFields): Promise<DailyRecordWriteResult>;
  /**
   * Fila que ya existe para ese `displayName` y esa `date`, o null si no hay
   * ninguna.
   *
   * Es lo que hace cumplir el Req 7.7 («como máximo un DailyRecord por
   * combinación de Nick y fecha») del lado servidor, en vez de fiarlo al puntero
   * que el cliente guarda en IndexedDB: ese puntero desaparece si se borran los
   * datos del sitio, si se entra desde otro navegador o si el usuario cierra
   * sesión, y cada pérdida creaba una fila más del mismo nick el mismo día.
   */
  findExisting(displayName: string, date: string): Promise<ExistingDailyRecord | null>;
  /**
   * Fila con ese `id`, o null si ya no existe.
   *
   * Es la lectura que permite aplicar el suelo monótono también cuando el
   * cliente manda `id`. Tiene que ser una lectura del servidor: usar el
   * `previousGoodPostureSeconds` que viaja en la mutación abriría un agujero,
   * porque lo declara el cliente y `keepMonotonic` lo persistiría tal cual.
   */
  findById(id: string): Promise<ExistingDailyRecord | null>;
}

/**
 * Contadores del día que no pueden decrecer, con el valor ya persistido.
 *
 * Hace falta porque el cliente pierde sus minutos locales al cerrar sesión: al
 * reentrar el mismo día cree de buena fe que lleva 0 segundos, y sin esta guarda
 * el `update` machacaría con 17 los 289 segundos que la nube ya tenía. Los
 * segundos de buena postura de un día solo crecen; el nivel y el XP son
 * acumulados de por vida, así que tampoco bajan; `longestFlowStreak` es un
 * máximo por definición.
 *
 * No abre ningún agujero anti-trampa: el valor que se conserva es uno que
 * `validateWrite` ya aprobó cuando se escribió. `avgScore` queda fuera porque es
 * una media, no un contador: ahí el valor recién medido es el correcto.
 */
function keepMonotonic(
  fields: DailyRecordFields,
  existing: ExistingDailyRecord,
): DailyRecordFields {
  const highest = (
    incoming: number | null | undefined,
    stored: number | null | undefined,
  ): number | null | undefined => {
    if (stored === null || stored === undefined) return incoming;
    if (incoming === null || incoming === undefined) return stored;
    return Math.max(incoming, stored);
  };

  return {
    ...fields,
    goodPostureSeconds: Math.max(fields.goodPostureSeconds, existing.goodPostureSeconds),
    longestFlowStreak: highest(fields.longestFlowStreak, existing.longestFlowStreak),
    level: highest(fields.level, existing.level),
    xp: highest(fields.xp, existing.xp),
  };
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

  // El id que manda el cliente tiene prioridad: es el único caso en que la fila
  // a actualizar puede tener un `displayName` distinto del que llega, que es lo
  // que ocurre justo después de un cambio de nick (Req 5.8). Las consultas van
  // después del veredicto: una escritura rechazada no gasta una lectura.
  //
  // El suelo monótono se aplica aquí también, no solo en la rama sin id: al
  // reentrar el mismo día tras cerrar sesión, el cliente conserva su puntero
  // local y manda `id` con los contadores a cero, y sin esta lectura ese
  // `update` machacaba la fila del ranking.
  if (id) {
    const stored = await writer.findById(id);
    return writer.update(id, stored === null ? fields : keepMonotonic(fields, stored));
  }

  // Sin id (primer envío del día, puntero local perdido, otro navegador) la
  // verdad está en el servidor.
  const existing = await writer.findExisting(displayName, date);

  if (existing) {
    return writer.update(existing.id, keepMonotonic(fields, existing));
  }

  return writer.create(fields);
}
