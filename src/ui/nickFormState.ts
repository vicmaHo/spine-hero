// Regla pura del botón de envío del Formulario_Acceso. Sin DOM, testeable en Node.
//
// src/ui/ solo puede importar de src/contracts/ y src/store/ (frontera de
// structure.md); nickRules.ts vive en src/storage/, así que aquí se duplican
// las constantes mínimas de validez de nick y correo en vez de importarlas.

const NICK_PATTERN = /^[A-Za-z0-9_-]{3,16}$/;
const EMAIL_MIN_LENGTH = 6;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export type NickFormMode = 'signIn' | 'signUp';

function isNickValid(nick: string): boolean {
  return NICK_PATTERN.test(nick.trim());
}

function isEmailValid(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  return (
    trimmed.length >= EMAIL_MIN_LENGTH &&
    trimmed.length <= EMAIL_MAX_LENGTH &&
    EMAIL_PATTERN.test(trimmed)
  );
}

/**
 * El envío está habilitado si y solo si no hay operación en curso y los
 * campos del modo activo son válidos (solo el Nick en 'signIn'; Nick y
 * correo en 'signUp').
 */
export function canSubmit(
  mode: NickFormMode,
  nick: string,
  email: string,
  busy: boolean,
): boolean {
  if (busy) return false;
  if (!isNickValid(nick)) return false;
  if (mode === 'signUp' && !isEmailValid(email)) return false;
  return true;
}
