/**
 * Mapa de mensajes en español para `IdentityError` (Sistema_Identidad).
 *
 * Función pura: traduce cada variante de `IdentityError` a su literal exacto
 * de los requisitos y al campo del formulario que debe marcarse. Vive en
 * `src/store/` (no en `src/storage/`) para que `src/ui/` pueda mostrar el
 * mensaje sin importar `src/storage/` directamente (frontera de
 * `structure.md`: `ui/` solo importa `contracts/` y `store/`).
 */
import type { IdentityError } from '../storage/identityErrors';

export interface IdentityMessage {
  text: string;
  /**
   * Campo del formulario que el mensaje señala. `'both'` marca los dos: el
   * fallo está en la pareja (Nick, Correo_Vinculado), no en uno de ellos.
   * `null` significa que el fallo no es de un dato escrito, y es lo que la
   * interfaz usa para ofrecer «Reintentar».
   */
  field: 'nick' | 'email' | 'both' | null;
}

export function identityErrorMessage(error: IdentityError): IdentityMessage {
  switch (error.kind) {
    case 'NICK_INVALID':
      return {
        text: 'El nick debe tener entre 3 y 16 caracteres: letras, números, guion o guion bajo',
        field: 'nick',
      };
    case 'EMAIL_INVALID':
      return {
        text: 'Introduce un correo electrónico válido',
        field: 'email',
      };
    case 'NICK_TAKEN':
      return {
        text: 'Ese nick ya está en uso, prueba otro',
        field: 'nick',
      };
    case 'EMAIL_TAKEN':
      return {
        text: `Ese correo ya tiene el nick «${error.nick}» asociado. Entra con él o usa otro correo`,
        field: 'email',
      };
    case 'NICK_EMAIL_MISMATCH':
      // Un único texto para «ese correo no tiene cuenta» y «la tiene con otro
      // nick»: el mensaje no revela cuál de los dos datos falla, ni si el
      // correo está registrado (ver el comentario de la variante en
      // `identityErrors.ts`).
      return {
        text: 'Ese nick y ese correo no coinciden. Comprueba los dos e inténtalo de nuevo',
        field: 'both',
      };
    case 'OFFLINE':
      return {
        text: 'Sin conexión para comprobar el nick. Puedes continuar sin nick',
        field: 'nick',
      };
    case 'TIMEOUT':
    case 'BACKEND':
      return {
        text: 'No se pudo comprobar el nick. Revisa tu conexión e inténtalo de nuevo',
        field: null,
      };
    case 'LOCAL_WRITE_FAILED':
      return {
        text: 'Tu nick no se ha podido guardar para el próximo arranque',
        field: null,
      };
    default: {
      // Comprobación exhaustiva: si `IdentityError` gana una variante nueva,
      // esta línea deja de compilar hasta que se añada aquí su mensaje.
      const exhaustiveCheck: never = error;
      return exhaustiveCheck;
    }
  }
}
