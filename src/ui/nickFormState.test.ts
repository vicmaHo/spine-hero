import { describe, it, expect } from 'vitest';
import { canSubmit, type NickFormMode } from './nickFormState';
import {
  DEFAULT_SEED,
  CASES_PER_PROPERTY,
  randBool,
  pick,
  genNickCandidate,
  genEmailCandidate,
  runProperty,
  type Rng,
} from '../storage/__tests__/gen';

/** Semilla propia, distinta de las usadas por las demás propiedades. */
const CANSUBMIT_SEED = DEFAULT_SEED + 808;

// Oráculo independiente: reimplementación aparte de las mismas reglas
// documentadas en `nickFormState.ts`, sin llamar a sus helpers privados.
const NICK_PATTERN = /^[A-Za-z0-9_-]{3,16}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

function oracleIsNickValid(nick: string): boolean {
  return NICK_PATTERN.test(nick.trim());
}

function oracleIsEmailValid(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  return trimmed.length >= 6 && trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed);
}

function oracleCanSubmit(mode: NickFormMode, nick: string, email: string, busy: boolean): boolean {
  if (busy) return false;
  if (!oracleIsNickValid(nick)) return false;
  if (mode === 'signUp' && !oracleIsEmailValid(email)) return false;
  return true;
}

interface Case {
  mode: NickFormMode;
  nick: string;
  email: string;
  busy: boolean;
}

function genCase(rng: Rng): Case {
  return {
    mode: pick(rng, ['signIn', 'signUp'] as const),
    nick: genNickCandidate(rng),
    email: genEmailCandidate(rng),
    busy: randBool(rng, 0.3),
  };
}

/**
 * Property 17: El botón de envío refleja exactamente la validez del formulario.
 *
 * Oráculo independiente: reimplementación aparte de la regla de `canSubmit`
 * comparada frente al comportamiento real, sobre `mode`, `nick`, `email` y
 * `busy` generados aleatoriamente.
 *
 * Validates: Requirements 1.11, 8.3, 8.4, 8.5
 */
describe('Property 17: canSubmit refleja exactamente la validez del formulario', () => {
  it(`coincide con el oráculo independiente en ${CASES_PER_PROPERTY} casos generados (semilla ${CANSUBMIT_SEED})`, () => {
    runProperty(CANSUBMIT_SEED, CASES_PER_PROPERTY, genCase, (c) => {
      expect(canSubmit(c.mode, c.nick, c.email, c.busy)).toBe(
        oracleCanSubmit(c.mode, c.nick, c.email, c.busy),
      );
    });
  });
});

describe('canSubmit: casos de frontera', () => {
  const validNick = 'jugador1';
  const validEmail = 'jugador1@ejemplo.com';

  it('con busy en true, deshabilita el envío en ambos modos aunque nick y correo sean válidos', () => {
    expect(canSubmit('signIn', validNick, validEmail, true)).toBe(false);
    expect(canSubmit('signUp', validNick, validEmail, true)).toBe(false);
  });

  it('en signUp, con nick válido y correo inválido o vacío, deshabilita el envío', () => {
    expect(canSubmit('signUp', validNick, '', false)).toBe(false);
    expect(canSubmit('signUp', validNick, 'no-es-un-correo', false)).toBe(false);
  });

  it('en signIn, con nick válido, habilita el envío sin importar el contenido del correo', () => {
    expect(canSubmit('signIn', validNick, '', false)).toBe(true);
    expect(canSubmit('signIn', validNick, 'basura-sin-sentido', false)).toBe(true);
  });

  it('con nick inválido o vacío, deshabilita el envío en ambos modos sin importar el correo', () => {
    expect(canSubmit('signIn', '', validEmail, false)).toBe(false);
    expect(canSubmit('signUp', '', validEmail, false)).toBe(false);
    expect(canSubmit('signIn', 'ab', validEmail, false)).toBe(false);
    expect(canSubmit('signUp', 'ab', validEmail, false)).toBe(false);
  });

  it('en signUp, con nick y correo válidos y busy en false, habilita el envío', () => {
    expect(canSubmit('signUp', validNick, validEmail, false)).toBe(true);
  });

  it('en signIn, con nick válido y busy en false, habilita el envío', () => {
    expect(canSubmit('signIn', validNick, '', false)).toBe(true);
  });
});
