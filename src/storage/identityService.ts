/**
 * Sistema_Identidad: alta, acceso y cambio de nick sobre `UserIdentity`.
 *
 * Único módulo que habla con `UserIdentity`, `NickClaim` y `EmailClaim`. El
 * cliente de datos se recibe por parámetro (`IdentityDataClient`) para poder
 * testear el servicio en Node con un doble en memoria; en producción el store
 * le pasa un adaptador sobre `generateClient<Schema>()` (`identityClient.ts`,
 * tarea 6.3).
 *
 * La unicidad de nick y de correo no se comprueba leyendo y luego escribiendo:
 * se delega a la condición de escritura de las claims (`NickClaim`,
 * `EmailClaim`), que DynamoDB aplica sobre su clave de partición sin ventana
 * de carrera.
 */

import { saveLocalIdentity } from './identityLocal';
import type { ActiveIdentity, IdentityError, IdentityResult } from './identityErrors';
import { isValidEmail, isValidNick, normalizeEmail, normalizeNick, toNickLower } from './nickRules';

/** Plazo de abandono duro de cualquier operación contra el Sistema_Data (Req 8.7, 12.3). */
export const IDENTITY_TIMEOUT_MS = 10_000;

/** Datos mínimos para crear un registro `UserIdentity` (Req 1.5). */
export interface UserIdentityInput {
  id: string;
  nick: string;
  nickLower: string;
  email: string;
}

/** Resultado de una escritura sobre una claim (`NickClaim` o `EmailClaim`). */
export type ClaimResult = { ok: true } | { ok: false; reason: 'TAKEN' | 'FAILED' };

/**
 * Cliente de datos que consume el Sistema_Identidad. Lo implementa
 * `identityClient.ts` en producción y `fakeIdentityClient.ts` en los tests.
 */
export interface IdentityDataClient {
  createEmailClaim(email: string, identityId: string): Promise<ClaimResult>;
  getEmailClaim(email: string): Promise<{ identityId: string } | null>;
  createNickClaim(nickLower: string, identityId: string): Promise<ClaimResult>;
  getNickClaim(nickLower: string): Promise<{ identityId: string } | null>;
  findByNickLower(nickLower: string): Promise<ActiveIdentity | null>;
  findByEmail(email: string): Promise<ActiveIdentity | null>;
  createIdentity(record: UserIdentityInput): Promise<ActiveIdentity | null>;
  updateNick(id: string, nick: string, nickLower: string): Promise<ActiveIdentity | null>;
}

export interface IdentityService {
  /** Modo «Crear nick». */
  signUp(rawNick: string, rawEmail: string): Promise<IdentityResult<ActiveIdentity>>;
  /**
   * Modo «Ya tengo nick». Exige el Correo_Vinculado con el que se reclamó el
   * Nick y solo concede el acceso si ese correo es el titular de ese Nick.
   */
  signIn(rawNick: string, rawEmail: string): Promise<IdentityResult<ActiveIdentity>>;
  /** Cambio de nick conservando id y correo. */
  changeNick(current: ActiveIdentity, rawNick: string): Promise<IdentityResult<ActiveIdentity>>;
}

/** Marca interna: distingue "se agotó el plazo" de cualquier otro rechazo de la promesa. */
class IdentityTimeoutError extends Error {}

/**
 * Envuelve `promise` en un plazo de `ms`. Si se agota, la promesa devuelta
 * rechaza con `IdentityTimeoutError`; si `promise` resuelve o rechaza antes,
 * se propaga tal cual.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new IdentityTimeoutError('identity operation timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Traduce cualquier fallo capturado (timeout o error de backend) a `IdentityError`. */
function toBackendError(err: unknown): IdentityError {
  if (err instanceof IdentityTimeoutError) return { kind: 'TIMEOUT' };
  return { kind: 'BACKEND', detail: String(err) };
}

export function createIdentityService(client: IdentityDataClient): IdentityService {
  /**
   * Reserva `nickLower` para `identityId`. Devuelve `null` si queda reservado y
   * un `IdentityError` si no se puede.
   *
   * La clave ocupada **no** implica que el nick esté en uso. `changeNick` crea
   * la claim del nick nuevo y deja la anterior sin borrar (ninguna claim se
   * borra nunca, decisión de diseño), así que un nick abandonado conserva su
   * claim sin que ningún `UserIdentity` lo lleve. Sin esta comprobación ese nick
   * quedaba inservible para todo el mundo y para siempre: «Ya tengo nick» decía
   * «Ese nick no está registrado» (no hay identidad) y «Crear nick» decía «Ese
   * nick ya está en uso» (la claim existe), sin salida por ninguna de las dos.
   *
   * La autoridad sobre «este nick lo lleva alguien» es el índice de
   * `UserIdentity`; la claim es el cerrojo que resuelve la carrera entre dos
   * altas simultáneas. Sigue haciendo ese trabajo para nicks nuevos, que es el
   * caso habitual; el hueco de carrera que esto abre se limita a dos altas
   * simultáneas que compitan por una claim ya huérfana. Es la misma recuperación
   * que el alta ya hacía con la claim de correo.
   */
  async function reserveNick(
    nickLower: string,
    identityId: string,
  ): Promise<IdentityError | null> {
    const claim = await withTimeout(
      client.createNickClaim(nickLower, identityId),
      IDENTITY_TIMEOUT_MS,
    );
    if (claim.ok) return null;
    if (claim.reason !== 'TAKEN') {
      return { kind: 'BACKEND', detail: 'createNickClaim failed' };
    }

    const holder = await withTimeout(client.findByNickLower(nickLower), IDENTITY_TIMEOUT_MS);
    if (holder === null) return null; // claim huérfana: el nick está libre
    if (holder.userIdentityId === identityId) return null; // ya es mío
    return { kind: 'NICK_TAKEN' };
  }

  async function signUp(
    rawNick: string,
    rawEmail: string,
  ): Promise<IdentityResult<ActiveIdentity>> {
    // Validación pura antes de cualquier red (Req 2.7, 5.5): ninguna operación
    // se emite si el nick o el correo no cumplen su patrón.
    if (!isValidNick(rawNick)) return { ok: false, error: { kind: 'NICK_INVALID' } };
    if (!isValidEmail(rawEmail)) return { ok: false, error: { kind: 'EMAIL_INVALID' } };

    // Única lectura del navegador que hace el servicio (Req 12.6).
    if (navigator.onLine === false) return { ok: false, error: { kind: 'OFFLINE' } };

    const nick = normalizeNick(rawNick);
    const nickLower = toNickLower(nick);
    const email = normalizeEmail(rawEmail);
    let identityId: string = crypto.randomUUID();

    try {
      const emailClaim = await withTimeout(
        client.createEmailClaim(email, identityId),
        IDENTITY_TIMEOUT_MS,
      );

      if (!emailClaim.ok) {
        if (emailClaim.reason === 'FAILED') {
          return { ok: false, error: { kind: 'BACKEND', detail: 'createEmailClaim failed' } };
        }

        // Clave ocupada: puede ser un UserIdentity real o una claim huérfana
        // de un alta interrumpida (el correo quedó reservado pero nunca se
        // llegó a crear el UserIdentity porque el nick estaba ocupado).
        const existing = await withTimeout(client.findByEmail(email), IDENTITY_TIMEOUT_MS);
        if (existing !== null) {
          return { ok: false, error: { kind: 'EMAIL_TAKEN', nick: existing.nick } };
        }

        const orphanClaim = await withTimeout(client.getEmailClaim(email), IDENTITY_TIMEOUT_MS);
        if (orphanClaim === null) {
          // La claim que acaba de fallar por ocupada ya no está: fallo de
          // infraestructura, no una carrera legítima.
          return { ok: false, error: { kind: 'BACKEND', detail: 'email claim inconsistente' } };
        }
        identityId = orphanClaim.identityId;
      }

      const nickError = await reserveNick(nickLower, identityId);
      if (nickError !== null) return { ok: false, error: nickError };

      const created = await withTimeout(
        client.createIdentity({ id: identityId, nick, nickLower, email }),
        IDENTITY_TIMEOUT_MS,
      );
      if (created === null) {
        return { ok: false, error: { kind: 'BACKEND', detail: 'createIdentity failed' } };
      }

      // El fallo de escritura local no revoca el acceso concedido en esta
      // sesión (Req 4.8): se intenta guardar y se ignora el resultado.
      await saveLocalIdentity(created);
      return { ok: true, value: created };
    } catch (err) {
      return { ok: false, error: toBackendError(err) };
    }
  }

  /**
   * Modo «Ya tengo nick»: comprueba que el Nick pertenece al Correo_Vinculado
   * que lo reclamó (Req 2.3, 2.9).
   *
   * La consulta va **por correo**, no por nick. La comprobación necesita
   * enfrentar dos valores, y el que se traiga del Sistema_Data es el que queda
   * expuesto: consultando por nick habría que traerse el correo almacenado
   * para compararlo en el navegador, y entonces cualquiera que supiese un nick
   * podría leer el correo de su titular. Consultando por correo, lo que vuelve
   * es el nick —un dato que el Ranking_Equipo ya publica— y el correo nunca
   * sale del servidor (Req 9.7).
   */
  async function signIn(
    rawNick: string,
    rawEmail: string,
  ): Promise<IdentityResult<ActiveIdentity>> {
    // Validación pura antes de cualquier red (Req 2.7): ninguna operación se
    // emite si el nick o el correo no cumplen su patrón.
    if (!isValidNick(rawNick)) return { ok: false, error: { kind: 'NICK_INVALID' } };
    if (!isValidEmail(rawEmail)) return { ok: false, error: { kind: 'EMAIL_INVALID' } };

    // Única lectura del navegador que hace el servicio (Req 12.6).
    if (navigator.onLine === false) return { ok: false, error: { kind: 'OFFLINE' } };

    const nickLower = toNickLower(normalizeNick(rawNick));
    const email = normalizeEmail(rawEmail);

    try {
      const owner = await withTimeout(client.findByEmail(email), IDENTITY_TIMEOUT_MS);

      // Un solo rechazo para los dos motivos: ese correo no tiene identidad, o
      // la tiene con otro nick. Req 2.4: no se crea ningún registro ni se
      // escribe en el Almacen_Local_Identidad.
      if (owner === null || toNickLower(owner.nick) !== nickLower) {
        return { ok: false, error: { kind: 'NICK_EMAIL_MISMATCH' } };
      }

      // Req 2.3: se adopta el nick tal como está almacenado, no como lo
      // escribió el usuario. `findByEmail` ya lo devuelve así.
      // El fallo de escritura local no revoca el acceso concedido (Req 4.8).
      await saveLocalIdentity(owner);
      return { ok: true, value: owner };
    } catch (err) {
      return { ok: false, error: toBackendError(err) };
    }
  }

  async function changeNick(
    current: ActiveIdentity,
    rawNick: string,
  ): Promise<IdentityResult<ActiveIdentity>> {
    // Validación pura antes de cualquier red (Req 5.5): ninguna operación se
    // emite si el nick no cumple su patrón.
    if (!isValidNick(rawNick)) return { ok: false, error: { kind: 'NICK_INVALID' } };

    // Única lectura del navegador que hace el servicio (Req 12.6).
    if (navigator.onLine === false) return { ok: false, error: { kind: 'OFFLINE' } };

    const nick = normalizeNick(rawNick);
    const nickLower = toNickLower(nick);
    const capitalizationOnlyChange = nickLower === toNickLower(current.nick);

    try {
      if (!capitalizationOnlyChange) {
        // El nickLower cambia: `reserveNick` reclama la claim y solo devuelve
        // NICK_TAKEN si otra identidad lleva ese nick de verdad (Req 5.6). Una
        // claim huérfana —incluida la que dejó un cambio de nick anterior de
        // esta misma persona— no bloquea: así se puede volver a un nick propio
        // que se abandonó.
        const nickError = await reserveNick(nickLower, current.userIdentityId);
        if (nickError !== null) return { ok: false, error: nickError };
      }
      // Si solo cambia la capitalización, se salta la claim y se actualiza
      // directamente (Req 5.2). La claim antigua queda huérfana: ninguna
      // claim se borra nunca (decisión de diseño, no se libera el nickLower anterior).

      const updated = await withTimeout(
        client.updateNick(current.userIdentityId, nick, nickLower),
        IDENTITY_TIMEOUT_MS,
      );
      if (updated === null) {
        // Conservar el nick anterior como identidad activa es responsabilidad
        // del llamador (el store, tarea 9.2); aquí solo se reporta el fallo.
        return { ok: false, error: { kind: 'BACKEND', detail: 'updateNick failed' } };
      }

      // El fallo de escritura local no revoca el acceso concedido (Req 4.8).
      await saveLocalIdentity(updated);
      return { ok: true, value: updated };
    } catch (err) {
      return { ok: false, error: toBackendError(err) };
    }
  }

  return { signUp, signIn, changeNick };
}
