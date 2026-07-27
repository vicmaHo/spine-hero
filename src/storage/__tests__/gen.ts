/**
 * Generador determinista de casos para las propiedades de corrección de
 * `identidad-nick` (Desviación D4 del diseño: sin dependencias npm nuevas,
 * sin reducción automática de contraejemplos).
 *
 * PRNG xorshift32 con semilla fija, generadores de nick, correo,
 * `Checkpoint`, `GameState` y secuencias de operaciones, más `runProperty`
 * para recorrer 200 casos por propiedad e imprimir semilla y caso al fallar.
 */
import type { Checkpoint } from '../../contracts/sync';
import type { GameState, PetMood } from '../../contracts/game';

// ─── PRNG ───────────────────────────────────────────────────────────────────

/** Número de casos por propiedad (por encima del mínimo habitual de 100). */
export const CASES_PER_PROPERTY = 200;

/** Semilla fija por defecto: cualquier fallo es reproducible sin más contexto. */
export const DEFAULT_SEED = 0x2f6e2b1;

export type Rng = () => number;

/**
 * xorshift32: PRNG determinista de 32 bits. Devuelve una función que, en
 * cada llamada, produce un flotante en `[0, 1)`.
 */
export function xorshift32(seed: number): Rng {
  // Un estado inicial de 0 degenera el algoritmo (se queda en 0 para siempre).
  let state = seed === 0 ? 0x9e3779b9 : seed >>> 0;

  return function next(): number {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

/** Alias explícito de `xorshift32`: crea el generador base a partir de una semilla. */
export function createRng(seed: number): Rng {
  return xorshift32(seed);
}

// ─── Helpers de generación numérica y de cadenas ───────────────────────────

/** Entero en `[min, max]`, ambos incluidos. */
export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Booleano con probabilidad `p` (0-1) de ser `true`. */
export function randBool(rng: Rng, p = 0.5): boolean {
  return rng() < p;
}

/** Elige un elemento al azar de un array no vacío. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randInt(rng, 0, items.length - 1)];
}

const NICK_VALID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const NICK_INVALID_EXTRA_CHARS = ' áéíóúñ!@#$%^&*()+=[]{}|\\:;"\'<>,.?/~`€ 日本語';

/** Cadena aleatoria de longitud `length` tomando caracteres de `charset`. */
function randomStringFrom(rng: Rng, length: number, charset: string): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[randInt(rng, 0, charset.length - 1)];
  }
  return out;
}

// ─── Generador de nick ──────────────────────────────────────────────────────

/**
 * Candidato de nick: mezcla longitudes de 0 a 20 (cubriendo las fronteras
 * 2, 3, 16 y 17 del Requisito 1 criterio 2) y, a veces, caracteres fuera del
 * alfabeto permitido, para ejercitar tanto casos válidos como inválidos.
 */
export function genNickCandidate(rng: Rng): string {
  const boundaryLengths = [0, 1, 2, 3, 4, 15, 16, 17, 20];
  const length = randBool(rng, 0.5) ? pick(rng, boundaryLengths) : randInt(rng, 0, 20);

  if (length === 0) return '';

  const useInvalidChar = randBool(rng, 0.25);
  if (!useInvalidChar) {
    return randomStringFrom(rng, length, NICK_VALID_CHARS);
  }

  // Inserta un carácter inválido en una posición aleatoria de una cadena
  // por lo demás válida, para ejercitar el rechazo del patrón.
  const base = randomStringFrom(rng, length, NICK_VALID_CHARS).split('');
  const invalidChar = NICK_INVALID_EXTRA_CHARS[randInt(rng, 0, NICK_INVALID_EXTRA_CHARS.length - 1)];
  const pos = randInt(rng, 0, base.length - 1);
  base[pos] = invalidChar;
  return base.join('');
}

// ─── Generador de correo ────────────────────────────────────────────────────

const EMAIL_LOCAL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789._-';
const EMAIL_DOMAIN_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789-';
const EMAIL_TLDS = ['com', 'es', 'io', 'a', 'org', 'net'];

/**
 * Candidato de correo: mezcla direcciones bien formadas de longitud variable
 * con roturas deliberadas (sin `@`, sin punto en el dominio, TLD de 1
 * carácter, longitud fuera de 6-254) para ejercitar el rechazo del patrón.
 */
export function genEmailCandidate(rng: Rng): string {
  const kind = randInt(rng, 0, 4);

  const localLength = randInt(rng, 1, 10);
  const local = randomStringFrom(rng, localLength, EMAIL_LOCAL_CHARS) || 'a';
  const domainLength = randInt(rng, 1, 10);
  const domain = randomStringFrom(rng, domainLength, EMAIL_DOMAIN_CHARS) || 'a';
  const tld = pick(rng, EMAIL_TLDS);

  switch (kind) {
    case 0:
      // Válido y bien formado.
      return `${local}@${domain}.${tld}`;
    case 1:
      // Sin arroba: siempre inválido.
      return `${local}${domain}.${tld}`;
    case 2:
      // Sin punto en el dominio: siempre inválido.
      return `${local}@${domain}`;
    case 3: {
      // Demasiado corto o demasiado largo para el rango 6-254.
      const tooShort = randBool(rng);
      return tooShort ? 'a@b.c'.slice(0, randInt(rng, 0, 5)) : `${local}@${domain}.${tld}`.padEnd(260, 'x');
    }
    default:
      // Válido, ejercitando mayúsculas para comprobar la normalización.
      return `${local.toUpperCase()}@${domain}.${tld}`;
  }
}

// ─── Generador de Checkpoint ────────────────────────────────────────────────

function genDateString(rng: Rng): string {
  const year = randInt(rng, 2023, 2026);
  const month = randInt(rng, 1, 12);
  const day = randInt(rng, 1, 28);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `Checkpoint` de `src/contracts/sync.ts`: solo enteros agregados y una cadena de fecha. */
export function genCheckpoint(rng: Rng): Checkpoint {
  const checkpoint: Checkpoint = {
    date: genDateString(rng),
    goodPostureSeconds: randInt(rng, 0, 86400),
    longestFlowStreak: randInt(rng, 0, 600),
    avgScore: randInt(rng, 0, 100),
    level: randInt(rng, 1, 50),
    xp: randInt(rng, 0, 100000),
  };

  if (randBool(rng, 0.5)) {
    checkpoint.teamCode = randomStringFrom(rng, randInt(rng, 4, 20), EMAIL_DOMAIN_CHARS.toUpperCase());
  }

  return checkpoint;
}

// ─── Generador de GameState ─────────────────────────────────────────────────

const PET_MOODS: readonly PetMood[] = ['idle', 'happy', 'sad', 'faint'];
const ACHIEVEMENT_IDS = ['racha_3', 'racha_7', 'nivel_5', 'flow_10min', 'primer_dia'];

/** `GameState` de `src/contracts/game.ts`, con campos dentro de sus rangos declarados. */
export function genGameState(rng: Rng): GameState {
  const achievementCount = randInt(rng, 0, ACHIEVEMENT_IDS.length);
  const achievements: string[] = [];
  for (let i = 0; i < achievementCount; i++) {
    achievements.push(pick(rng, ACHIEVEMENT_IDS));
  }

  return {
    xp: randInt(rng, 0, 100000),
    level: randInt(rng, 1, 50),
    hp: randInt(rng, 0, 100),
    flowSeconds: randInt(rng, 0, 36000),
    goodSecondsToday: randInt(rng, 0, 86400),
    mood: pick(rng, PET_MOODS),
    achievements,
    streakDays: randInt(rng, 0, 365),
    lastTickAt: randInt(rng, 0, 2_000_000_000_000),
  };
}

// ─── Generador genérico de secuencias de operaciones ───────────────────────

/**
 * Genera una secuencia de `length` elementos usando `itemGen`, reutilizando
 * el mismo `rng` para toda la secuencia. Los tests de propiedad la
 * especializan con su propio generador de operación (p. ej. altas, accesos
 * y cambios de nick contra el doble `fakeIdentityClient`).
 */
export function genSequence<T>(rng: Rng, length: number, itemGen: (rng: Rng) => T): T[] {
  const out: T[] = [];
  for (let i = 0; i < length; i++) {
    out.push(itemGen(rng));
  }
  return out;
}

// ─── Runner de propiedades ──────────────────────────────────────────────────

/**
 * Ejecuta `check` contra `cases` valores generados deterministamente a
 * partir de `seed`. Si `check` lanza, se imprime la semilla, el índice del
 * caso y el propio caso generado antes de relanzar el error, para que el
 * fallo sea reproducible sin reducción automática de contraejemplos
 * (Desviación D4).
 */
export function runProperty<T>(
  seed: number,
  cases: number,
  gen: (rng: Rng) => T,
  check: (value: T) => void,
): void {
  const rng = createRng(seed);

  for (let i = 0; i < cases; i++) {
    const value = gen(rng);
    try {
      check(value);
    } catch (error) {
      // Impresión deliberada (no código de producción): sin reducción automática
      // de contraejemplos, la semilla y el caso son lo único que hace el fallo reproducible.
      console.error(
        `runProperty: fallo en el caso ${i + 1}/${cases} con semilla ${seed}.\nCaso: ${JSON.stringify(value)}`,
      );
      throw error;
    }
  }
}
