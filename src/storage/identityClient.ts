/**
 * Adaptador real de `IdentityDataClient` (tarea 6.3) sobre `generateClient<Schema>()`.
 *
 * Único punto donde el Sistema_Identidad toca AppSync/DynamoDB en producción.
 * La unicidad de nick y de correo no se comprueba leyendo y luego escribiendo:
 * se delega a la condición de escritura que Amplify Gen 2 genera para los
 * modelos con `.identifier([...])` (`NickClaim`, `EmailClaim`): un `create`
 * con una clave ya existente falla en el servidor con un error de tipo
 * `DynamoDB:ConditionalCheckFailedException`, sin dejar registro parcial.
 */

import { generateClient } from 'aws-amplify/data';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import type { Schema } from '../../amplify/data/resource';
import type { ActiveIdentity } from './identityErrors';
import type { ClaimResult, IdentityDataClient, UserIdentityInput } from './identityService';

type DataClient = ReturnType<typeof generateClient<Schema>>;

interface GraphQLLikeError {
  message?: string | null;
  errorType?: string | null;
}

/**
 * Detecta una condición de clave ocupada (create sobre `.identifier([...])`
 * con una clave que ya existe).
 *
 * Heurística: AppSync documenta que el resolver DynamoDB devuelve, ante un
 * fallo de condición, un error con `errorType: "DynamoDB:ConditionalCheckFailedException"`
 * y un `message` que contiene "ConditionalCheckFailedException" (ver
 * "Condition expressions" en la guía de AppSync). Se comprueban ambos campos
 * por si el transporte solo conserva uno de los dos. Verificar contra
 * `npx ampx sandbox` antes de confiar en esto en producción: si AWS cambia el
 * texto o el tipo de error, esta función deja de detectar el caso TAKEN y las
 * claims ocupadas se clasificarían como FAILED en su lugar.
 */
function isConditionFailure(errors: readonly GraphQLLikeError[] | null | undefined): boolean {
  if (!errors || errors.length === 0) return false;
  return errors.some(
    (e) =>
      (typeof e.errorType === 'string' && e.errorType.includes('ConditionalCheckFailedException')) ||
      (typeof e.message === 'string' && e.message.includes('ConditionalCheckFailedException')),
  );
}

function toActiveIdentity(record: { id: string; nick: string }): ActiveIdentity {
  return { nick: record.nick, userIdentityId: record.id };
}

/**
 * Saca a la consola los errores de GraphQL de una operación.
 *
 * El Sistema_Identidad los colapsa en `IdentityError` («BACKEND»), que la
 * interfaz muestra como un único mensaje genérico (Req 8.7). Sin esta traza,
 * un fallo de autorización o de validación de campo es indistinguible de una
 * caída de red desde el navegador.
 */
function logErrors(op: string, errors: readonly GraphQLLikeError[] | null | undefined): void {
  if (!errors?.length) return;
  // Texto plano, no el array: la consola colapsa `Array(1)` y esconde justo el
  // mensaje que hace falta para distinguir un fallo de autorización de uno de
  // validación de campo.
  for (const e of errors) {
    console.error(`[identityClient] ${op} falló: ${e.errorType ?? 'sin errorType'} — ${e.message ?? 'sin message'}`);
  }
}

/** Crea un claim (`EmailClaim`/`NickClaim`) delegando la unicidad a la condición de escritura. */
async function createClaim(
  op: string,
  create: () => Promise<{ data: unknown; errors?: readonly GraphQLLikeError[] | null }>,
): Promise<ClaimResult> {
  const { data, errors } = await create();
  if (isConditionFailure(errors)) return { ok: false, reason: 'TAKEN' };
  logErrors(op, errors);
  if (errors?.length || !data) return { ok: false, reason: 'FAILED' };
  return { ok: true };
}

/**
 * Cierra cualquier sesión de Cognito residual para que AppSync reciba
 * Credenciales_Invitado.
 *
 * `identidad-nick` retiró el `Authenticator` de la interfaz (Req 14.7), pero no
 * el estado que Amplify ya había guardado en `localStorage`. Un navegador que
 * usó el login anterior sigue presentando credenciales del rol *authenticated*,
 * y los modelos de identidad autorizan únicamente `allow.guest()`, o sea el rol
 * *unauthenticated* (Req 6.6): el resolver responde
 * «Not Authorized to access createEmailClaim on type Mutation» y el alta es
 * imposible hasta que esa sesión se cierra.
 *
 * Idempotente y silenciosa: sin sesión que cerrar no hace nada. Nunca propaga
 * un fallo, porque el arranque de la aplicación no debe depender de la nube
 * (Req 12.5).
 */
export async function ensureGuestSession(): Promise<void> {
  try {
    const session = await fetchAuthSession();
    if (!session.tokens) return; // ya es una sesión de invitado
    console.warn('[identityClient] sesión de Cognito residual: se cierra para usar Credenciales_Invitado');
    await signOut();
  } catch (err) {
    // Estado de sesión inconsistente (p. ej. tokens caducados sin refresco):
    // se limpia igualmente, que es lo que devuelve al carril de invitado.
    console.warn('[identityClient] estado de sesión inconsistente, se limpia:', err);
    try {
      await signOut();
    } catch {
      // Nada que cerrar.
    }
  }
}

/** Crea el adaptador real. Fábrica, no singleton: cada llamada obtiene su propio `generateClient`. */
export function createRealIdentityClient(): IdentityDataClient {
  // `authMode` explícito: la app solo tiene Credenciales_Invitado (Req 6.6), y
  // omitirlo deja que mande el modo por defecto de la API. Explicitarlo aquí
  // hace que el alta funcione aunque el `amplify_outputs.json` desplegado
  // todavía tenga `userPool` como defecto.
  const client: DataClient = generateClient<Schema>({ authMode: 'identityPool' });

  return {
    async createEmailClaim(email, identityId) {
      return createClaim('EmailClaim.create', () =>
        client.models.EmailClaim.create({ email, identityId }),
      );
    },

    async getEmailClaim(email) {
      const { data, errors } = await client.models.EmailClaim.get({ email });
      logErrors('EmailClaim.get', errors);
      return data ? { identityId: data.identityId } : null;
    },

    async createNickClaim(nickLower, identityId) {
      return createClaim('NickClaim.create', () =>
        client.models.NickClaim.create({ nickLower, identityId }),
      );
    },

    async getNickClaim(nickLower) {
      const { data, errors } = await client.models.NickClaim.get({ nickLower });
      logErrors('NickClaim.get', errors);
      return data ? { identityId: data.identityId } : null;
    },

    async findByNickLower(nickLower) {
      const { data, errors } = await client.models.UserIdentity.listByNickLower(
        { nickLower },
        { selectionSet: ['id', 'nick'] as const },
      );
      logErrors('listByNickLower', errors);
      const found = data[0];
      return found ? toActiveIdentity(found) : null;
    },

    async findByEmail(email) {
      // Selección limitada a ['id','nick']: el correo nunca viaja de vuelta
      // en una consulta (Req 9.7, privacidad).
      const { data, errors } = await client.models.UserIdentity.listByEmail(
        { email },
        { selectionSet: ['id', 'nick'] as const },
      );
      logErrors('listByEmail', errors);
      const found = data[0];
      return found ? toActiveIdentity(found) : null;
    },

    async createIdentity(record: UserIdentityInput) {
      const { data, errors } = await client.models.UserIdentity.create({
        id: record.id,
        nick: record.nick,
        nickLower: record.nickLower,
        email: record.email,
      });
      logErrors('UserIdentity.create', errors);
      return data ? toActiveIdentity(data) : null;
    },

    async updateNick(id, nick, nickLower) {
      // Sin `email`: Amplify actualiza de forma parcial, así que el correo se
      // conserva en el servidor sin volver a enviarlo (Req 9.1).
      const { data, errors } = await client.models.UserIdentity.update({ id, nick, nickLower });
      logErrors('UserIdentity.update', errors);
      return data ? toActiveIdentity(data) : null;
    },
  };
}
