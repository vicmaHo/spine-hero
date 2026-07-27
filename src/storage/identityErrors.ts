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
  // Acceso rechazado en «Ya tengo nick»: no existe ninguna identidad con ese
  // par (Nick, Correo_Vinculado). Una sola variante para los dos motivos —el
  // correo no tiene cuenta, o la tiene con otro nick— a propósito: separarlos
  // permitiría averiguar qué correos están registrados probando un nick
  // conocido contra una lista de direcciones.
  | { kind: 'NICK_EMAIL_MISMATCH' }
  | { kind: 'OFFLINE' }
  | { kind: 'TIMEOUT' }
  | { kind: 'BACKEND'; detail: string }
  | { kind: 'LOCAL_WRITE_FAILED' };

export type IdentityResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: IdentityError };
