/**
 * Almacen_Local_Identidad: persistencia del Nick activo en IndexedDB.
 *
 * Nunca guarda el Correo_Vinculado (Requisito 9 criterio 8). Un nick leído
 * que no cumple el patrón se trata como ausencia de nick, sin borrar el
 * contenido local (Requisito 4 criterio 7).
 */

import {
  clearLocalIdentityRecord,
  getLocalIdentityRecord,
  saveLocalIdentityRecord,
} from './db';
import type { ActiveIdentity, IdentityResult } from './identityErrors';
import { isValidNick } from './nickRules';

/** Lee la identidad activa guardada localmente. */
export async function loadLocalIdentity(): Promise<IdentityResult<ActiveIdentity | null>> {
  try {
    const record = await getLocalIdentityRecord();
    if (record === null) {
      return { ok: true, value: null };
    }
    // Un nick que ya no cumple el patrón se trata como ausencia de nick,
    // sin tocar el registro almacenado (Requisito 4 criterio 7).
    if (!isValidNick(record.nick)) {
      return { ok: true, value: null };
    }
    return { ok: true, value: { nick: record.nick, userIdentityId: record.userIdentityId } };
  } catch (err) {
    return { ok: false, error: { kind: 'BACKEND', detail: String(err) } };
  }
}

/** Escribe la identidad activa, sustituyendo el registro anterior. */
export async function saveLocalIdentity(identity: ActiveIdentity): Promise<IdentityResult<void>> {
  try {
    await saveLocalIdentityRecord({
      nick: identity.nick,
      userIdentityId: identity.userIdentityId,
    });
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: { kind: 'LOCAL_WRITE_FAILED' } };
  }
}

/** Elimina la identidad activa («Cambiar de usuario»). */
export async function clearLocalIdentity(): Promise<IdentityResult<void>> {
  try {
    await clearLocalIdentityRecord();
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, error: { kind: 'LOCAL_WRITE_FAILED' } };
  }
}
