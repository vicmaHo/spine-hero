/**
 * Anti-cheat validator para mutaciones de update de DailyRecord.
 *
 * Exporta:
 * - validateAntiCheat: función pura testeable sin DynamoDB
 * - handler: Lambda handler de AppSync que orquesta la validación
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Máximo absoluto de segundos en un día */
export const MAX_DAILY_SECONDS = 86_400;

/** Margen de tolerancia sobre el tiempo real transcurrido (10%) */
export const TOLERANCE_FACTOR = 1.1;

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ExistingRecord {
  goodPostureSeconds: number;
  updatedAt: string;
}

export interface ValidateAntiCheatParams {
  newGoodPostureSeconds: number;
  existing: ExistingRecord | null;
  nowMs: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ─── Función pura de validación ───────────────────────────────────────────────

/**
 * Valida si una actualización de goodPostureSeconds es plausible.
 * No accede a DynamoDB ni al reloj — recibe todo como parámetro.
 */
export function validateAntiCheat(params: ValidateAntiCheatParams): ValidationResult {
  const { newGoodPostureSeconds, existing, nowMs } = params;

  // Regla 1: rechazar si excede el máximo diario absoluto
  if (newGoodPostureSeconds > MAX_DAILY_SECONDS) {
    return {
      valid: false,
      reason: 'goodPostureSeconds excede el máximo diario de 86400',
    };
  }

  // Regla 2: si no hay registro previo y valor es válido, aceptar
  if (!existing) {
    return { valid: true };
  }

  // Regla 3: si hay registro previo, verificar incremento vs tiempo transcurrido
  const increment = newGoodPostureSeconds - existing.goodPostureSeconds;

  // Si no hay incremento (valor igual o menor), aceptar
  if (increment <= 0) {
    return { valid: true };
  }

  const elapsedMs = nowMs - new Date(existing.updatedAt).getTime();
  const elapsedSeconds = elapsedMs / 1000;
  const maxAllowed = elapsedSeconds * TOLERANCE_FACTOR;

  if (increment > maxAllowed) {
    return {
      valid: false,
      reason: 'Incremento de goodPostureSeconds excede el tiempo transcurrido permitido',
    };
  }

  return { valid: true };
}

// ─── Helper para obtener registro existente ───────────────────────────────────

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Nombre de la tabla se obtiene de la variable de entorno inyectada por Amplify
const TABLE_NAME = process.env.DAILYRECORD_TABLE_NAME ?? '';

/**
 * Busca el registro DailyRecord existente para un owner y fecha dados.
 * Usa el índice por owner (implícito en Amplify) para filtrar por fecha.
 */
async function getExistingRecord(
  owner: string,
  date: string
): Promise<ExistingRecord | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'byOwnerAndDate',
      KeyConditionExpression: '#owner = :owner AND #date = :date',
      ExpressionAttributeNames: {
        '#owner': 'owner',
        '#date': 'date',
      },
      ExpressionAttributeValues: {
        ':owner': owner,
        ':date': date,
      },
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const item = result.Items[0];
  return {
    goodPostureSeconds: item.goodPostureSeconds as number,
    updatedAt: item.updatedAt as string,
  };
}

// ─── Lambda handler ───────────────────────────────────────────────────────────

interface DailyRecordInput {
  id: string;
  date: string;
  goodPostureSeconds: number;
  longestFlowStreak?: number;
  avgScore?: number;
  level?: number;
  xp?: number;
  teamCode?: string;
}

interface AppSyncEvent {
  arguments: { input: DailyRecordInput };
  identity: { sub: string };
}

export const handler = async (event: AppSyncEvent): Promise<DailyRecordInput> => {
  const { goodPostureSeconds, date } = event.arguments.input;
  const owner = event.identity.sub;

  // Obtener registro previo de DynamoDB
  const existing = await getExistingRecord(owner, date);

  // Validar con la función pura
  const result = validateAntiCheat({
    newGoodPostureSeconds: goodPostureSeconds,
    existing,
    nowMs: Date.now(),
  });

  if (!result.valid) {
    throw new Error(result.reason ?? 'Validación anti-trampa fallida');
  }

  // Permitir la mutación
  return event.arguments.input;
};
