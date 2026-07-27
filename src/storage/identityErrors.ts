/**
 * Tipos de error de la identidad basada en nick (Sistema_Identidad).
 *
 * Unión discriminada, nada de excepciones con cadenas: cualquier operación
 * de `identityService.ts` que pueda fallar devuelve un `IdentityResult<T>`.
 *
 * Deliberadamente en `src/storage/`, no en `src/contracts/`: ese directorio
 * es compartido y protegido, y estos tipos son internos del módulo de
 * identidad (Requisito 11 criterio 3).
 */

/** Identidad activa: el Nick tal como está almacenado y el id inmutable de su registro. */
export interface ActiveIdentity {
  nick: string;
  userIdentityId: string;
}

export type IdentityError =
  | { kind: 'NICK_INVALID' }
  | { kind: 'EMAIL_INVALID' }
  | { kind: 'NICK_TAKEN' }
  | { kind: 'EMAIL_TAKEN'; nick: string }
  | { kind: 'NICK_NOT_FOUND' }
  | { kind: 'OFFLINE' }
  | { kind: 'TIMEOUT' }
  | { kind: 'BACKEND'; detail: string }
  | { kind: 'LOCAL_WRITE_FAILED' };

export type IdentityResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: IdentityError };
