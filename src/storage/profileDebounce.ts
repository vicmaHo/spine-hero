import { saveProfile } from './profileStore';
import type { ProfileRecord } from './profileStore';

export const DEBOUNCE_MS = 5000;

let pending: ProfileRecord | null = null;
let timerId: ReturnType<typeof setTimeout> | null = null;

/**
 * Agenda un guardado de perfil. Si ya hay un timer activo,
 * solo reemplaza el registro pendiente sin reiniciar el timer.
 */
export function scheduleProfileSave(record: ProfileRecord): void {
  pending = record;
  if (timerId === null) {
    timerId = setTimeout(flush, DEBOUNCE_MS);
  }
}

/**
 * Escribe inmediatamente el registro pendiente (si lo hay)
 * y cancela el timer activo.
 */
export function flushNow(): void {
  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }
  flush();
}

function flush(): void {
  timerId = null;
  if (pending) {
    const record = pending;
    pending = null;
    saveProfile(record);
  }
}
