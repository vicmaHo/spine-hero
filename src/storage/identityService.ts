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
  /** Modo «Ya tengo nick». No transmite nunca el correo. */
  signIn(rawNick: string): Promise<IdentityResult<ActiveIdentity>>;
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

      const nickClaim = await withTimeout(
        client.createNickClaim(nickLower, identityId),
        IDENTITY_TIMEOUT_MS,
      );

      if (!nickClaim.ok) {
        if (nickClaim.reason === 'TAKEN') {
          return { ok: false, error: { kind: 'NICK_TAKEN' } };
        }
        return { ok: false, error: { kind: 'BACKEND', detail: 'createNickClaim failed' } };
      }

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

  async function signIn(rawNick: string): Promise<IdentityResult<ActiveIdentity>> {
    // Validación pura antes de cualquier red (Req 2.7): ninguna operación se
    // emite si el nick no cumple su patrón.
    if (!isValidNick(rawNick)) return { ok: false, error: { kind: 'NICK_INVALID' } };

    // Única lectura del navegador que hace el servicio (Req 12.6).
    if (navigator.onLine === false) return { ok: false, error: { kind: 'OFFLINE' } };

    const nickLower = toNickLower(normalizeNick(rawNick));

    try {
      const found = await withTimeout(client.findByNickLower(nickLower), IDENTITY_TIMEOUT_MS);

      if (found === null) {
        // Req 2.4: no crear ningún registro, no escribir en el Almacen_Local_Identidad.
        return { ok: false, error: { kind: 'NICK_NOT_FOUND' } };
      }

      // Req 2.3: se adopta el nick tal como está almacenado, no como lo
      // escribió el usuario. `findByNickLower` ya lo devuelve así.
      // El fallo de escritura local no revoca el acceso concedido (Req 4.8).
      await saveLocalIdentity(found);
      return { ok: true, value: found };
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
        // El nickLower cambia: hay que comprobar colisión con otra identidad
        // antes de reclamar la claim (Req 5.6).
        const existing = await withTimeout(client.findByNickLower(nickLower), IDENTITY_TIMEOUT_MS);
        if (existing !== null && existing.userIdentityId !== current.userIdentityId) {
          return { ok: false, error: { kind: 'NICK_TAKEN' } };
        }

        const nickClaim = await withTimeout(
          client.createNickClaim(nickLower, current.userIdentityId),
          IDENTITY_TIMEOUT_MS,
        );
        if (!nickClaim.ok) {
          if (nickClaim.reason === 'TAKEN') {
            return { ok: false, error: { kind: 'NICK_TAKEN' } };
          }
          return { ok: false, error: { kind: 'BACKEND', detail: 'createNickClaim failed' } };
        }
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
