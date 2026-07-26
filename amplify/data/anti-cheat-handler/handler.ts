/**
 * Handler Lambda para la custom mutation validateAndUpdateDailyRecord.
 *
 * Valida que el incremento de goodPostureSeconds no exceda el tiempo real
 * transcurrido (+10% margen). Si pasa, devuelve los datos para que el
 * resolver de AppSync complete la operación.
 *
 * El cliente envía los datos del registro previo (previousGoodPostureSeconds
 * y previousUpdatedAt) para que el handler valide sin acceder a DynamoDB.
 * Para la demo esto es suficiente. En producción se leería de la base.
 */

import type { Schema } from '../resource';

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Token con el que se prefijan los mensajes de rechazo. Es el contrato con el
 * cliente: solo si el mensaje lo lleva se trata como trampa real; cualquier
 * otro error (mutación no desplegada, permisos, red) es fallo de
 * infraestructura y no debe bloquear la sincronización.
 */
export const ANTICHEAT_REJECT_TOKEN = 'ANTICHEAT_REJECT';

/** Margen de tolerancia (10%) */
const TOLERANCE_FACTOR = 1.1;

/** Máximo absoluto de segundos en un día */
const MAX_DAILY_SECONDS = 86_400;

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler: Schema['validateAndUpdateDailyRecord']['functionHandler'] = async (event) => {
  const {
    id,
    date,
    goodPostureSeconds,
    previousGoodPostureSeconds,
    previousUpdatedAt,
  } = event.arguments;

  // Regla 1: rechazar si excede el máximo diario absoluto
  if (goodPostureSeconds > MAX_DAILY_SECONDS) {
    throw new Error(
      `${ANTICHEAT_REJECT_TOKEN}: goodPostureSeconds excede el máximo diario de 86400`
    );
  }

  // Regla 2: si hay datos del registro previo, validar incremento vs tiempo
  if (
    previousGoodPostureSeconds !== undefined &&
    previousGoodPostureSeconds !== null &&
    previousUpdatedAt
  ) {
    const increment = goodPostureSeconds - previousGoodPostureSeconds;

    if (increment > 0) {
      const elapsedMs = Date.now() - new Date(previousUpdatedAt).getTime();
      const elapsedSeconds = elapsedMs / 1000;
      const maxAllowed = elapsedSeconds * TOLERANCE_FACTOR;

      if (increment > maxAllowed) {
        throw new Error(
          `${ANTICHEAT_REJECT_TOKEN}: Incremento de ${increment}s excede los ${Math.floor(maxAllowed)}s permitidos (tiempo transcurrido × 1.1)`
        );
      }
    }
  }

  // Validación pasó — devolver resultado
  return { id, date, goodPostureSeconds };
};
