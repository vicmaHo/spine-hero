import { describe, it, expect } from 'vitest';
import { buildRanking } from './RankingPanel';
import {
  DEFAULT_SEED,
  CASES_PER_PROPERTY,
  randInt,
  randBool,
  runProperty,
  type Rng,
} from '../storage/__tests__/gen';

/** Semilla propia, distinta de las usadas por las demás propiedades. */
const RANKING_SEED = DEFAULT_SEED + 707;

/** Los cuatro únicos campos que `TeamEntry` debe exponer (Requisitos 9.4, 10.6). */
const TEAM_ENTRY_FIELDS = ['displayName', 'goodPostureSeconds', 'level', 'streakDays'];

/**
 * Registro de entrada simulado. Incluye `email` y `userIdentityId`: campos que
 * ya no existen en el esquema pero que, si `buildRanking` recibiera algo con
 * ellos por una llamada con tipado laxo, no deben sobrevivir al mapeo.
 */
interface FakeRecord {
  displayName?: string | null;
  goodPostureSeconds: number;
  level?: number | null;
  email?: string;
  userIdentityId?: string;
}

function genDisplayNameVariant(rng: Rng): string | null | undefined {
  const kind = randInt(rng, 0, 4);
  switch (kind) {
    case 0:
      return undefined;
    case 1:
      return null;
    case 2:
      return '';
    case 3:
      return '   '; // Solo espacios: debe anonimizarse igual que vacío/ausente.
    default:
      return `jugador${randInt(rng, 1, 999)}`;
  }
}

function genFakeRecord(rng: Rng): FakeRecord {
  return {
    displayName: genDisplayNameVariant(rng),
    goodPostureSeconds: randInt(rng, 0, 86400),
    level: randBool(rng) ? randInt(rng, 1, 50) : undefined,
    email: `filtrado${randInt(rng, 1, 999)}@ejemplo.com`,
    userIdentityId: `id-filtrado-${randInt(rng, 1, 999)}`,
  };
}

/** Escenario: una lista de longitud variable, a propósito cruzando la frontera de 50. */
function genScenario(rng: Rng): FakeRecord[] {
  const recordCount = randInt(rng, 0, 80);
  const records: FakeRecord[] = [];
  for (let i = 0; i < recordCount; i++) records.push(genFakeRecord(rng));
  return records;
}

/**
 * Property 13: El ranking ordena, recorta y anonimiza sin filtrar nada más.
 *
 * Oráculo independiente: ordenar por `goodPostureSeconds` descendente,
 * recortar a 50 y comparar cada fila resultante contra el registro de origen
 * en esa misma posición.
 *
 * Validates: Requirements 7.3, 7.9, 9.4, 10.6
 */
describe('Property 13: el ranking ordena, recorta y anonimiza sin filtrar nada más', () => {
  it(`en ${CASES_PER_PROPERTY} escenarios generados (semilla ${RANKING_SEED})`, () => {
    runProperty(RANKING_SEED, CASES_PER_PROPERTY, genScenario, (records) => {
      const result = buildRanking(records);

      // Recorta: nunca más de 50 filas, y todas si hay 50 o menos.
      expect(result.length).toBe(Math.min(records.length, 50));

      // Ordena: no creciente por goodPostureSeconds.
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].goodPostureSeconds).toBeGreaterThanOrEqual(result[i].goodPostureSeconds);
      }

      // Oráculo independiente: mismo orden y recorte, calculados aparte.
      const sortedInput = [...records]
        .sort((a, b) => b.goodPostureSeconds - a.goodPostureSeconds)
        .slice(0, 50);

      for (let i = 0; i < result.length; i++) {
        const expectedRaw = sortedInput[i].displayName;
        const isBlank = expectedRaw == null || expectedRaw.trim().length === 0;

        // Anonimiza sin alterar la posición que da goodPostureSeconds.
        expect(result[i].displayName).toBe(isBlank ? 'Anónimo' : expectedRaw);
        expect(result[i].goodPostureSeconds).toBe(sortedInput[i].goodPostureSeconds);
        expect(result[i].level).toBe(sortedInput[i].level ?? 1);

        // Sin filtrar nada más: exactamente los cuatro campos de TeamEntry,
        // ni rastro de `email` ni `userIdentityId` aunque el registro de
        // origen los llevara.
        expect(Object.keys(result[i]).sort()).toEqual([...TEAM_ENTRY_FIELDS].sort());
      }
    });
  });
});

describe('buildRanking: casos de frontera', () => {
  it('con exactamente 50 registros, conserva todos sin recortar', () => {
    const records = Array.from({ length: 50 }, (_, i) => ({
      displayName: `jugador${i}`,
      goodPostureSeconds: i,
    }));

    const result = buildRanking(records);
    expect(result.length).toBe(50);
  });

  it('con exactamente 51 registros, descarta el de menor goodPostureSeconds', () => {
    const records = Array.from({ length: 51 }, (_, i) => ({
      displayName: `jugador${i}`,
      goodPostureSeconds: i,
    }));

    const result = buildRanking(records);
    expect(result.length).toBe(50);
    expect(result.some((entry) => entry.displayName === 'jugador0')).toBe(false);
    expect(result.some((entry) => entry.displayName === 'jugador1')).toBe(true);
  });

  it('con cero registros, devuelve una lista vacía', () => {
    expect(buildRanking([])).toEqual([]);
  });

  it('con displayName solo de espacios, muestra «Anónimo»', () => {
    const result = buildRanking([{ displayName: '   ', goodPostureSeconds: 10 }]);
    expect(result[0].displayName).toBe('Anónimo');
  });
});
