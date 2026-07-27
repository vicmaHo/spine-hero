// Reglas puras de validación y normalización de nick y correo. Sin red, sin DOM.

export const NICK_MIN_LENGTH = 3;
export const NICK_MAX_LENGTH = 16;
export const NICK_PATTERN = /^[A-Za-z0-9_-]{3,16}$/;
export const NICK_LOWER_PATTERN = /^[a-z0-9_-]{3,16}$/;
export const EMAIL_MIN_LENGTH = 6;
export const EMAIL_MAX_LENGTH = 254;
/** texto@dominio.tld: ≥1 carácter antes de @, ≥1 punto en el dominio, ≥2 tras el último punto. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

/** Recorta extremos. No cambia la capitalización: el nick visible es el escrito. */
export function normalizeNick(raw: string): string {
  return raw.trim();
}

/** Minúsculas ASCII del nick ya recortado. Es la clave de unicidad (Nick_Normalizado). */
export function toNickLower(nick: string): string {
  return nick.toLowerCase();
}

/** Recorta extremos y pasa a minúsculas ASCII la cadena completa. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidNick(raw: string): boolean {
  return NICK_PATTERN.test(normalizeNick(raw));
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return (
    email.length >= EMAIL_MIN_LENGTH &&
    email.length <= EMAIL_MAX_LENGTH &&
    EMAIL_PATTERN.test(email)
  );
}
