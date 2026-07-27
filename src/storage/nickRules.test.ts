import { describe, it, expect } from 'vitest';
import {
  isValidNick,
  isValidEmail,
  normalizeNick,
  toNickLower,
  NICK_LOWER_PATTERN,
  NICK_MIN_LENGTH,
  NICK_MAX_LENGTH,
} from './nickRules';
import {
  DEFAULT_SEED,
  CASES_PER_PROPERTY,
  genNickCandidate,
  genEmailCandidate,
  runProperty,
  randInt,
  pick,
  type Rng,
} from './__tests__/gen';

/** Semilla distinta de la usada por la Propiedad 2, para no confundir ambos fallos. */
const EMAIL_PROPERTY_SEED = DEFAULT_SEED + 1;

/** Semillas distintas de las usadas por las Propiedades 2 y 3. */
const NICK_NORMALIZATION_PROPERTY_SEED = DEFAULT_SEED + 2;
const VALID_NICK_PROPERTY_SEED = DEFAULT_SEED + 3;

const NICK_ALPHABET_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const WHITESPACE_CHARS = [' ', '\t', '\n'] as const;

/** Nick válido: longitud entre NICK_MIN_LENGTH y NICK_MAX_LENGTH, alfabeto permitido. */
function genValidNick(rng: Rng): string {
  const length = randInt(rng, NICK_MIN_LENGTH, NICK_MAX_LENGTH);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += NICK_ALPHABET_CHARS[randInt(rng, 0, NICK_ALPHABET_CHARS.length - 1)];
  }
  return out;
}

/**
 * Envuelve `s` con una cantidad variable (0-4) de espacios, tabulaciones y
 * saltos de línea en cada extremo. `genNickCandidate` no genera relleno de
 * blancos por sí solo, así que esta envoltura es la que ejercita el recorte
 * de `normalizeNick` con distintas cantidades de espacio en los extremos.
 */
function wrapWithRandomWhitespace(rng: Rng, s: string): string {
  const leading = Array.from({ length: randInt(rng, 0, 4) }, () => pick(rng, WHITESPACE_CHARS)).join('');
  const trailing = Array.from({ length: randInt(rng, 0, 4) }, () => pick(rng, WHITESPACE_CHARS)).join('');
  return `${leading}${s}${trailing}`;
}

/**
 * Property 1: La normalización del nick es idempotente y coherente.
 *
 * Para cualquier cadena, `normalizeNick` aplicado dos veces da el mismo
 * resultado que aplicado una vez (solo recorta espacios de los extremos, así
 * que esto vale incluso para cadenas que no son un nick válido). Para
 * cualquier nick válido, `toNickLower` es idempotente, cumple
 * `NICK_LOWER_PATTERN` y conserva la longitud del nick.
 *
 * La coherencia del par `nickLower === toNickLower(nick)` que el
 * Sistema_Identidad envía se cumple por construcción en `identityService.ts`
 * (`signUp` y `changeNick` calculan `const nickLower = toNickLower(nick);`
 * justo antes de usarlo): lo único que podría romperla es que `toNickLower`
 * no fuera determinista, y eso ya lo cubre el test de idempotencia.
 *
 * Validates: Requirements 1.3, 6.10
 */
describe('Property 1: normalizeNick es idempotente para cualquier cadena', () => {
  it(`normalizeNick(normalizeNick(s)) === normalizeNick(s) en ${CASES_PER_PROPERTY} casos generados (semilla ${NICK_NORMALIZATION_PROPERTY_SEED})`, () => {
    runProperty(
      NICK_NORMALIZATION_PROPERTY_SEED,
      CASES_PER_PROPERTY,
      (rng) => wrapWithRandomWhitespace(rng, genNickCandidate(rng)),
      (candidate) => {
        const once = normalizeNick(candidate);
        expect(normalizeNick(once)).toBe(once);
      },
    );
  });
});

describe('Property 1: toNickLower es idempotente, coherente con el patrón y conserva la longitud', () => {
  it(`toNickLower(toNickLower(nick)) === toNickLower(nick) en ${CASES_PER_PROPERTY} nicks válidos generados (semilla ${VALID_NICK_PROPERTY_SEED})`, () => {
    runProperty(VALID_NICK_PROPERTY_SEED, CASES_PER_PROPERTY, genValidNick, (nick) => {
      const lower = toNickLower(nick);
      expect(toNickLower(lower)).toBe(lower);
    });
  });

  it(`toNickLower(nick) cumple NICK_LOWER_PATTERN en ${CASES_PER_PROPERTY} nicks válidos generados (semilla ${VALID_NICK_PROPERTY_SEED})`, () => {
    runProperty(VALID_NICK_PROPERTY_SEED, CASES_PER_PROPERTY, genValidNick, (nick) => {
      expect(NICK_LOWER_PATTERN.test(toNickLower(nick))).toBe(true);
    });
  });

  it(`toNickLower(nick).length === nick.length en ${CASES_PER_PROPERTY} nicks válidos generados (semilla ${VALID_NICK_PROPERTY_SEED})`, () => {
    runProperty(VALID_NICK_PROPERTY_SEED, CASES_PER_PROPERTY, genValidNick, (nick) => {
      expect(toNickLower(nick).length).toBe(nick.length);
    });
  });
});

describe('normalizeNick y toNickLower: casos de frontera y ejemplos explícitos', () => {
  it('normalizeNick recorta espacios, tabulaciones y saltos de línea en los extremos', () => {
    expect(normalizeNick('  \t nick_1 \n ')).toBe('nick_1');
  });

  it('normalizeNick no modifica una cadena sin espacios en los extremos', () => {
    expect(normalizeNick('nick_1')).toBe('nick_1');
  });

  it('normalizeNick no cambia la capitalización', () => {
    expect(normalizeNick('  NicK-1  ')).toBe('NicK-1');
  });

  it('toNickLower pasa a minúsculas un nick con mayúsculas mezcladas', () => {
    expect(toNickLower('NicK-1_A')).toBe('nick-1_a');
  });

  it('toNickLower conserva dígitos, guion y guion bajo tal cual', () => {
    expect(toNickLower('abc123_-XYZ')).toBe('abc123_-xyz');
  });
});

/**
 * Property 2: Un nick se acepta exactamente cuando cumple el patrón.
 *
 * Oráculo independiente: tras eliminar los espacios de los extremos, la
 * cadena debe tener entre 3 y 16 caracteres compuestos exclusivamente por
 * letras ASCII, dígitos, guion bajo y guion (Requisito 1 criterio 2).
 *
 * Validates: Requirements 1.2, 1.6, 2.7, 5.5, 8.4
 */

function oracleIsValidNick(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length >= 3 && trimmed.length <= 16 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}

describe('Property 2: isValidNick acepta exactamente cuando cumple el patrón', () => {
  it(`coincide con el oráculo independiente en ${CASES_PER_PROPERTY} casos generados (semilla ${DEFAULT_SEED})`, () => {
    runProperty(
      DEFAULT_SEED,
      CASES_PER_PROPERTY,
      (rng) => genNickCandidate(rng),
      (candidate) => {
        expect(isValidNick(candidate)).toBe(oracleIsValidNick(candidate));
      },
    );
  });
});

describe('isValidNick: casos de frontera', () => {
  it('rechaza un nick de 2 caracteres (por debajo del mínimo)', () => {
    expect(isValidNick('ab')).toBe(false);
  });

  it('acepta un nick de 3 caracteres (en el mínimo)', () => {
    expect(isValidNick('abc')).toBe(true);
  });

  it('acepta un nick de 16 caracteres (en el máximo)', () => {
    expect(isValidNick('a'.repeat(16))).toBe(true);
  });

  it('rechaza un nick de 17 caracteres (por encima del máximo)', () => {
    expect(isValidNick('a'.repeat(17))).toBe(false);
  });
});

describe('isValidNick: caracteres fuera del alfabeto', () => {
  it('rechaza un nick con un espacio interior', () => {
    expect(isValidNick('ab cd')).toBe(false);
  });

  it('rechaza un nick con una letra acentuada', () => {
    expect(isValidNick('nicó')).toBe(false);
  });

  it('rechaza un nick con el símbolo @', () => {
    expect(isValidNick('nick@1')).toBe(false);
  });

  it('rechaza un nick con el símbolo !', () => {
    expect(isValidNick('nick!')).toBe(false);
  });

  it('rechaza un nick con un punto', () => {
    expect(isValidNick('nick.1')).toBe(false);
  });
});

describe('isValidNick: recorte de espacios en los extremos (Requisito 1.2)', () => {
  it('acepta un nick válido rodeado de espacios en los extremos', () => {
    expect(isValidNick('  abc  ')).toBe(true);
  });

  it('rechaza si, tras recortar los extremos, queda por debajo del mínimo', () => {
    expect(isValidNick('  ab  ')).toBe(false);
  });
});

/**
 * Property 3: Un correo se acepta exactamente cuando cumple patrón y longitud.
 *
 * Oráculo independiente: tras recortar los extremos y pasar a minúsculas, la
 * cadena debe tener entre 6 y 254 caracteres y cumplir la forma
 * `texto@dominio.tld` (al menos un carácter antes de `@`, al menos un punto
 * en el dominio y al menos dos caracteres tras el último punto).
 *
 * Validates: Requirements 1.4, 1.7, 8.5
 */

function oracleIsValidEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  const pattern = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
  return email.length >= 6 && email.length <= 254 && pattern.test(email);
}

describe('Property 3: isValidEmail acepta exactamente cuando cumple patrón y longitud', () => {
  it(`coincide con el oráculo independiente en ${CASES_PER_PROPERTY} casos generados (semilla ${EMAIL_PROPERTY_SEED})`, () => {
    runProperty(
      EMAIL_PROPERTY_SEED,
      CASES_PER_PROPERTY,
      (rng) => genEmailCandidate(rng),
      (candidate) => {
        expect(isValidEmail(candidate)).toBe(oracleIsValidEmail(candidate));
      },
    );
  });
});

describe('isValidEmail: casos de frontera de longitud', () => {
  it('rechaza un correo de 5 caracteres (por debajo del mínimo)', () => {
    expect(isValidEmail('a@b.c')).toBe(false);
  });

  it('acepta un correo de 6 caracteres (en el mínimo)', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
  });

  it('acepta un correo de exactamente 254 caracteres', () => {
    // 'a@' + relleno + '.co' ajustado para dar exactamente 254 caracteres.
    const local = 'a';
    const tld = 'co';
    const fixedLength = local.length + 1 + 1 + tld.length; // local + '@' + '.' + tld
    const domain = 'b'.repeat(254 - fixedLength);
    const email = `${local}@${domain}.${tld}`;
    expect(email.length).toBe(254);
    expect(isValidEmail(email)).toBe(true);
  });

  it('rechaza un correo de 255 caracteres (por encima del máximo)', () => {
    const local = 'a';
    const tld = 'co';
    const fixedLength = local.length + 1 + 1 + tld.length;
    const domain = 'b'.repeat(255 - fixedLength);
    const email = `${local}@${domain}.${tld}`;
    expect(email.length).toBe(255);
    expect(isValidEmail(email)).toBe(false);
  });
});

describe('isValidEmail: casos de frontera del patrón', () => {
  it('rechaza un correo sin @', () => {
    expect(isValidEmail('userdomain.com')).toBe(false);
  });

  it('rechaza un correo cuyo dominio no tiene ningún punto', () => {
    expect(isValidEmail('user@domain')).toBe(false);
  });

  it('rechaza un correo con un TLD de 1 carácter', () => {
    expect(isValidEmail('user@domain.c')).toBe(false);
  });

  it('acepta un correo con un TLD de 2 caracteres', () => {
    expect(isValidEmail('user@domain.co')).toBe(true);
  });
});

describe('isValidEmail: normalización (Requisito 1.4)', () => {
  it('acepta un correo en mayúsculas (se valida tras pasar a minúsculas)', () => {
    expect(isValidEmail('USER@DOMAIN.COM')).toBe(true);
  });

  it('acepta un correo rodeado de espacios en los extremos', () => {
    expect(isValidEmail('  user@domain.com  ')).toBe(true);
  });
});
