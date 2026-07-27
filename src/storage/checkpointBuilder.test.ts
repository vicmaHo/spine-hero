import { describe, it, expect } from 'vitest';
import { buildCheckpoint, longestFlowStreakMinutes } from './checkpointBuilder';
import type { MinuteEntry, ProfileRecord } from './db';
import { FLOW_ROUNDING_SLACK_SECONDS } from '../../amplify/data/anti-cheat-handler/rules';
import {
  CASES_PER_PROPERTY,
  DEFAULT_SEED,
  randBool,
  randInt,
  runProperty,
  type Rng,
} from './__tests__/gen';

/** Entrada de minuto con los campos que la racha de flow mira. */
function minute(
  m: number,
  dominantStatus: 'GOOD' | 'BAD',
  goodSeconds: number,
): MinuteEntry {
  return { date: '2025-01-15', minute: m, avgScore: 80, dominantStatus, goodSeconds };
}

function makeProfile(): ProfileRecord {
  return {
    gameState: {
      xp: 120,
      level: 3,
      hp: 100,
      // Deliberadamente alto: el Checkpoint ya NO lo usa para la racha de flow.
      flowSeconds: 36_000,
      goodSecondsToday: 0,
      mood: 'idle',
      achievements: [],
      streakDays: 0,
      lastTickAt: 0,
    },
    calibration: null,
  };
}

describe('longestFlowStreakMinutes', () => {
  it('sin minutos es 0', () => {
    expect(longestFlowStreakMinutes([])).toBe(0);
  });

  it('ignora los minutos cuyo dominantStatus es BAD', () => {
    expect(longestFlowStreakMinutes([minute(10, 'BAD', 60), minute(11, 'BAD', 60)])).toBe(0);
  });

  it('suma los segundos buenos de minutos consecutivos GOOD', () => {
    // 3 minutos seguidos a 60 s = 180 s → 3 minutos de racha.
    const entries = [minute(10, 'GOOD', 60), minute(11, 'GOOD', 60), minute(12, 'GOOD', 60)];
    expect(longestFlowStreakMinutes(entries)).toBe(3);
  });

  it('un minuto BAD intermedio corta la racha y se queda con el mejor tramo', () => {
    const entries = [
      minute(10, 'GOOD', 60),
      minute(11, 'GOOD', 60), // tramo A = 120 s
      minute(12, 'BAD', 5),
      minute(13, 'GOOD', 60),
      minute(14, 'GOOD', 60),
      minute(15, 'GOOD', 60), // tramo B = 180 s → gana
    ];
    expect(longestFlowStreakMinutes(entries)).toBe(3);
  });

  it('un hueco en la numeración de minutos corta la racha', () => {
    // Sesión pausada: los minutos 11 y 12 no existen.
    const entries = [minute(10, 'GOOD', 60), minute(13, 'GOOD', 60)];
    expect(longestFlowStreakMinutes(entries)).toBe(1);
  });

  it('no depende del orden de entrada', () => {
    const entries = [minute(12, 'GOOD', 60), minute(10, 'GOOD', 60), minute(11, 'GOOD', 60)];
    expect(longestFlowStreakMinutes(entries)).toBe(3);
  });

  it('redondea a minutos completos por debajo', () => {
    // 60 + 59 = 119 s → 1 minuto completo.
    expect(longestFlowStreakMinutes([minute(10, 'GOOD', 60), minute(11, 'GOOD', 59)])).toBe(1);
  });

  it('cuenta los segundos reales, no los minutos ocupados', () => {
    // 10 minutos GOOD dominantes pero flojos (8 s buenos cada uno) = 80 s → 1.
    // Contarlos como 60 s cada uno daría 10 y dispararía FLOW_VS_GOOD.
    const entries = Array.from({ length: 10 }, (_, i) => minute(10 + i, 'GOOD', 8));
    expect(longestFlowStreakMinutes(entries)).toBe(1);
  });
});

describe('buildCheckpoint · racha de flow', () => {
  it('deriva longestFlowStreak de los minutos, no de GameState.flowSeconds', () => {
    const profile = makeProfile(); // flowSeconds = 36 000 (600 minutos)
    const entries = [minute(10, 'GOOD', 60), minute(11, 'GOOD', 60)];

    const checkpoint = buildCheckpoint('2025-01-15', entries, profile);

    expect(checkpoint.longestFlowStreak).toBe(2);
  });

  it('es 0 cuando no hay minutos, aunque el GameState tenga flow acumulado', () => {
    expect(buildCheckpoint('2025-01-15', [], makeProfile()).longestFlowStreak).toBe(0);
  });

  /**
   * Invariante que mantiene el Checkpoint fuera del alcance de la regla
   * FLOW_VS_GOOD del Validador_AntiTrampa, que rechaza cuando
   * `longestFlowStreak * 60 > goodPostureSeconds + FLOW_ROUNDING_SLACK_SECONDS`.
   * Se cumple por construcción: la racha suma los segundos buenos de un
   * subconjunto de los minutos del día.
   */
  it('nunca produce una racha que la regla FLOW_VS_GOOD pueda rechazar', () => {
    /** Día de minutos con huecos aleatorios, para que aparezcan tramos no contiguos. */
    const genDay = (rng: Rng): MinuteEntry[] => {
      const entries: MinuteEntry[] = [];
      let m = randInt(rng, 0, 1_000);
      const count = randInt(rng, 0, 40);
      for (let i = 0; i < count; i++) {
        m += randBool(rng) ? 1 : randInt(rng, 2, 4);
        entries.push(minute(m, randBool(rng) ? 'GOOD' : 'BAD', randInt(rng, 0, 60)));
      }
      return entries;
    };

    runProperty(DEFAULT_SEED, CASES_PER_PROPERTY, genDay, (entries) => {
      const checkpoint = buildCheckpoint('2025-01-15', entries, makeProfile());

      expect(checkpoint.longestFlowStreak * 60).toBeLessThanOrEqual(
        checkpoint.goodPostureSeconds + FLOW_ROUNDING_SLACK_SECONDS,
      );
    });
  });
});
