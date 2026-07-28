/**
 * Handler Lambda para la custom mutation validateAndUpdateDailyRecord.
 *
 * Reducido a veredicto y persistencia: delega en `handleValidatedUpdate`
 * (decision.ts) la evaluación de las reglas puras de rules.ts y, si el
 * veredicto acepta, la persistencia del DailyRecord (create sin `id`, update
 * con `id`) usando el propio cliente de datos de Amplify desde la Lambda. Si
 * el veredicto rechaza, `handleValidatedUpdate` lanza sin emitir ninguna
 * escritura.
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/antiCheatValidator';
import type { Schema } from '../resource';
import { handleValidatedUpdate, type DailyRecordWriter } from './decision';

export { ANTICHEAT_REJECT_TOKEN } from './decision';

// ─── Cliente de datos ─────────────────────────────────────────────────────────

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);

const client = generateClient<Schema>();

/** Adaptador de `DailyRecordWriter` sobre el cliente real de datos de Amplify. */
const dailyRecordWriter: DailyRecordWriter = {
  async create(fields) {
    const { data, errors } = await client.models.DailyRecord.create(fields);
    if (errors?.length || !data) {
      throw new Error(`No se pudo crear el DailyRecord: ${errors?.[0]?.message ?? 'desconocido'}`);
    }
    return { id: data.id, date: data.date, goodPostureSeconds: data.goodPostureSeconds };
  },
  async update(id, fields) {
    const { data, errors } = await client.models.DailyRecord.update({ id, ...fields });
    if (errors?.length || !data) {
      throw new Error(`No se pudo actualizar el DailyRecord: ${errors?.[0]?.message ?? 'desconocido'}`);
    }
    return { id: data.id, date: data.date, goodPostureSeconds: data.goodPostureSeconds };
  },
  async findById(id) {
    const { data, errors } = await client.models.DailyRecord.get(
      { id },
      { selectionSet: ['id', 'goodPostureSeconds', 'longestFlowStreak', 'level', 'xp'] as const },
    );
    // Se lanza en vez de devolver null: con null el `update` seguiría adelante
    // sin suelo monótono y podría rebajar la fila. El mensaje no lleva el token
    // ANTICHEAT_REJECT, así que el Sincronizador lo reintenta (Req 13.13).
    if (errors?.length) {
      throw new Error(`No se pudo leer el DailyRecord ${id}: ${errors[0]?.message ?? 'desconocido'}`);
    }
    return data ?? null;
  },
  async findExisting(displayName, date) {
    const { data, errors } = await client.models.DailyRecord.listByNameAndDate(
      { displayName, date: { eq: date } },
      {
        selectionSet: ['id', 'goodPostureSeconds', 'longestFlowStreak', 'level', 'xp'] as const,
        limit: 1,
      },
    );
    // Se lanza en vez de devolver null: un fallo de la consulta con null haría
    // crear una fila duplicada. El mensaje no lleva el token ANTICHEAT_REJECT,
    // así que el Sincronizador lo trata como infraestructura y lo reintenta
    // (Req 13.13).
    if (errors?.length) {
      throw new Error(`No se pudo buscar el DailyRecord del día: ${errors[0]?.message ?? 'desconocido'}`);
    }
    return data[0] ?? null;
  },
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler: Schema['validateAndUpdateDailyRecord']['functionHandler'] = async (event) =>
  handleValidatedUpdate(event.arguments, dailyRecordWriter, Date.now());
