/**
 * Tests unitarios de `identityErrorMessage`: los ocho literales exactos de
 * los requisitos y el campo asociado a cada uno.
 *
 * No es una propiedad: es una función pura de mapeo discreto (nueve
 * variantes de `IdentityError` sobre un dominio finito), exactamente el caso
 * de uso de tests unitarios explícitos en vez de generadores.
 *
 * Validates: Requirements 1.6, 1.7, 2.4, 3.2, 4.8, 8.7
 */
import { describe, it, expect } from 'vitest';
import { identityErrorMessage } from './identityMessages';

describe('identityErrorMessage', () => {
  it('NICK_INVALID → mensaje de patrón de nick, campo nick', () => {
    expect(identityErrorMessage({ kind: 'NICK_INVALID' })).toEqual({
      text: 'El nick debe tener entre 3 y 16 caracteres: letras, números, guion o guion bajo',
      field: 'nick',
    });
  });

  it('EMAIL_INVALID → mensaje de correo inválido, campo email', () => {
    expect(identityErrorMessage({ kind: 'EMAIL_INVALID' })).toEqual({
      text: 'Introduce un correo electrónico válido',
      field: 'email',
    });
  });

  it('NICK_TAKEN → mensaje de nick en uso, campo nick', () => {
    expect(identityErrorMessage({ kind: 'NICK_TAKEN' })).toEqual({
      text: 'Ese nick ya está en uso, prueba otro',
      field: 'nick',
    });
  });

  it('EMAIL_TAKEN → interpola el nick del registro existente, campo email', () => {
    expect(identityErrorMessage({ kind: 'EMAIL_TAKEN', nick: 'ejemplo' })).toEqual({
      text: 'Ese correo ya tiene el nick «ejemplo» asociado. Entra con él o usa otro correo',
      field: 'email',
    });
  });

  it('EMAIL_TAKEN → la interpolación es dinámica, no un literal fijo', () => {
    expect(identityErrorMessage({ kind: 'EMAIL_TAKEN', nick: 'otroNick99' })).toEqual({
      text: 'Ese correo ya tiene el nick «otroNick99» asociado. Entra con él o usa otro correo',
      field: 'email',
    });
  });

  it('NICK_EMAIL_MISMATCH → mensaje que no revela cuál de los dos falla, ambos campos', () => {
    expect(identityErrorMessage({ kind: 'NICK_EMAIL_MISMATCH' })).toEqual({
      text: 'Ese nick y ese correo no coinciden. Comprueba los dos e inténtalo de nuevo',
      field: 'both',
    });
  });

  it('NICK_EMAIL_MISMATCH → el texto no menciona si el correo está registrado', () => {
    // La variante cubre dos motivos (correo sin cuenta, o cuenta con otro nick)
    // y el mensaje no debe permitir distinguirlos: si lo hiciera, se podría
    // averiguar qué correos están dados de alta probando un nick conocido.
    const { text } = identityErrorMessage({ kind: 'NICK_EMAIL_MISMATCH' });
    expect(text).not.toMatch(/registrad|no existe|desconocid|en uso/i);
  });

  it('OFFLINE → mensaje de sin conexión, campo nick', () => {
    expect(identityErrorMessage({ kind: 'OFFLINE' })).toEqual({
      text: 'Sin conexión para comprobar el nick. Puedes continuar sin nick',
      field: 'nick',
    });
  });

  it('TIMEOUT → mensaje de fallo de comprobación, sin campo asociado', () => {
    expect(identityErrorMessage({ kind: 'TIMEOUT' })).toEqual({
      text: 'No se pudo comprobar el nick. Revisa tu conexión e inténtalo de nuevo',
      field: null,
    });
  });

  it('BACKEND → comparte texto y campo con TIMEOUT (mismo literal, distinta variante)', () => {
    expect(identityErrorMessage({ kind: 'BACKEND', detail: 'cualquier detalle' })).toEqual({
      text: 'No se pudo comprobar el nick. Revisa tu conexión e inténtalo de nuevo',
      field: null,
    });
  });

  it('LOCAL_WRITE_FAILED → mensaje de fallo de guardado local, sin campo asociado', () => {
    expect(identityErrorMessage({ kind: 'LOCAL_WRITE_FAILED' })).toEqual({
      text: 'Tu nick no se ha podido guardar para el próximo arranque',
      field: null,
    });
  });
});
