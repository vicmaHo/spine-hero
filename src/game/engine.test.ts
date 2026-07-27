import { describe, it, expect } from 'vitest';
import {
  tick,
  XP_PER_REWARD,
  XP_INTERVAL_S,
  HP_ENTER_BAD,
  FAINT_RECOVERY_S,
  FAINT_RECOVERY_HP,
  FLOW_MILESTONES_MIN,
  LEVEL_BASE_XP,
  ACHIEVEMENTS,
  levelThreshold,
  xpProgress,
} from './engine';
import { INITIAL_GAME_STATE } from '../contracts/game';
import type { GameState } from '../contracts/game';
import type { PostureFrame, PostureStatus } from '../contracts/posture';

function makeFrame(status: PostureStatus, t: number): PostureFrame {
  return {
    t,
    status,
    score: status === 'GOOD' ? 80 : 20,
    metrics: { neckRatio: 1, proximity: 1, tilt: 0, headTilt: 0 },
    confidence: 0.9,
  };
}

describe('tick', () => {
  it('otorga XP al completar un intervalo de buena postura', () => {
    const state: GameState = { ...INITIAL_GAME_STATE, lastTickAt: 1000, goodSecondsToday: 0 };
    // Un intervalo exacto en GOOD
    const t = 1000 + XP_INTERVAL_S * 1000;
    const result = tick(state, makeFrame('GOOD', t), t);

    expect(result.state.xp).toBe(XP_PER_REWARD);
    expect(result.events).toContainEqual({ type: 'XP_GAINED', amount: XP_PER_REWARD });
  });

  it('entrar en BAD resta 5 HP y emite HP_LOST', () => {
    const state: GameState = { ...INITIAL_GAME_STATE, flowSeconds: 100, hp: 100, lastTickAt: 1000 };
    const result = tick(state, makeFrame('BAD', 2000), 2000);

    expect(result.state.hp).toBe(100 - HP_ENTER_BAD);
    expect(result.state.flowSeconds).toBe(0);
    expect(result.events).toContainEqual({ type: 'HP_LOST', amount: HP_ENTER_BAD });
  });

  it('BAD continuo resta HP proporcional al tiempo', () => {
    const state: GameState = { ...INITIAL_GAME_STATE, flowSeconds: 0, hp: 100, lastTickAt: 1000 };
    const result = tick(state, makeFrame('BAD', 11000), 11000);

    // dt=10s, rate = 1/10 = 0.1 HP/s → 1 HP en 10s
    expect(result.state.hp).toBe(99);
  });

  it('60 s en AWAY no modifica ni HP ni XP ni Flow', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 80,
      xp: 50,
      flowSeconds: 500,
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('AWAY', 61000), 61000);

    expect(result.state.hp).toBe(80);
    expect(result.state.xp).toBe(50);
    expect(result.state.flowSeconds).toBe(500);
    expect(result.state.lastTickAt).toBe(61000);
  });

  it('LOW_CONF congela todos los contadores', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 80,
      xp: 50,
      flowSeconds: 500,
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('LOW_CONF', 61000), 61000);

    expect(result.state.hp).toBe(80);
    expect(result.state.xp).toBe(50);
    expect(result.state.flowSeconds).toBe(500);
    expect(result.state.lastTickAt).toBe(61000);
  });

  it('CALIBRATING congela todos los contadores', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 80,
      xp: 50,
      flowSeconds: 500,
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('CALIBRATING', 61000), 61000);

    expect(result.state.hp).toBe(80);
    expect(result.state.xp).toBe(50);
    expect(result.state.flowSeconds).toBe(500);
    expect(result.state.lastTickAt).toBe(61000);
  });

  it('sube de nivel al acumular XP suficiente', () => {
    // Umbral del nivel 1 = floor(LEVEL_BASE_XP * 1^1.5) = LEVEL_BASE_XP
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      level: 1,
      xp: LEVEL_BASE_XP - XP_PER_REWARD,
      goodSecondsToday: XP_INTERVAL_S - 1,
      lastTickAt: 1000,
    };
    // dt = 1s → cruza un intervalo → +XP_PER_REWARD → alcanza el umbral
    const result = tick(state, makeFrame('GOOD', 2000), 2000);

    expect(result.state.xp).toBe(LEVEL_BASE_XP);
    expect(result.state.level).toBe(2);
    expect(result.events).toContainEqual({ type: 'LEVEL_UP', level: 2 });
  });

  it('emite FLOW_MILESTONE al cruzar el primer hito de Flow', () => {
    const firstMilestone = FLOW_MILESTONES_MIN[0];
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      flowSeconds: firstMilestone * 60 - 1,
      lastTickAt: 1000,
    };
    // dt = 2s → cruza el hito
    const result = tick(state, makeFrame('GOOD', 3000), 3000);

    expect(result.events).toContainEqual({
      type: 'FLOW_MILESTONE',
      minutes: firstMilestone,
    });
  });

  it('HP a 0 cambia mood a faint y emite FAINTED', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 4,
      flowSeconds: 100,  // > 0 para que entre en BAD y pierda HP_ENTER_BAD=5
      mood: 'idle',
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('BAD', 2000), 2000);

    expect(result.state.hp).toBe(0);
    expect(result.state.mood).toBe('faint');
    expect(result.events).toContainEqual({ type: 'FAINTED' });
  });

  it('faint se recupera tras 5 min en GOOD', () => {
    const nearRecovery = FAINT_RECOVERY_S - 1; // 299
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      mood: 'faint',
      hp: 0,
      flowSeconds: nearRecovery,
      lastTickAt: 1000,
    };
    // dt = 2s → flowSeconds = 301 >= 300
    const result = tick(state, makeFrame('GOOD', 3000), 3000);

    expect(result.state.hp).toBe(FAINT_RECOVERY_HP);
    expect(result.state.mood).toBe('idle');
    expect(result.events).toContainEqual({ type: 'REVIVED' });
  });

  it('concede Espalda de Acero al alcanzar su umbral de Flow', () => {
    const achievement = ACHIEVEMENTS.find((a) => a.id === 'espalda_de_acero');
    if (!achievement || !('flowMin' in achievement)) {
      throw new Error('Logro espalda_de_acero no encontrado');
    }

    const state: GameState = {
      ...INITIAL_GAME_STATE,
      flowSeconds: achievement.flowMin * 60 - 1,
      lastTickAt: 1000,
    };
    // dt = 2s → cruza el umbral del logro
    const result = tick(state, makeFrame('GOOD', 3000), 3000);

    expect(result.events).toContainEqual({
      type: 'ACHIEVEMENT',
      id: 'espalda_de_acero',
      label: 'Espalda de Acero',
    });
  });

  it('logro Constante con 3 días de racha', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      streakDays: 3,
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('GOOD', 2000), 2000);

    expect(result.events).toContainEqual({
      type: 'ACHIEVEMENT',
      id: 'constante',
      label: 'Constante',
    });
    expect(result.state.achievements).toContain('constante');
  });

  it('no duplica logros ya obtenidos', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      streakDays: 3,
      achievements: ['constante'],
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('GOOD', 2000), 2000);

    const achievementEvents = result.events.filter((e) => e.type === 'ACHIEVEMENT');
    expect(achievementEvents).toHaveLength(0);
  });

  it('primer tick (lastTickAt = 0) no aplica dt', () => {
    const state: GameState = { ...INITIAL_GAME_STATE }; // lastTickAt = 0
    const result = tick(state, makeFrame('GOOD', 5000), 5000);

    // dt = 0 → no se acumula nada
    expect(result.state.xp).toBe(0);
    expect(result.state.flowSeconds).toBe(0);
    expect(result.state.goodSecondsToday).toBe(0);
  });

  it('mood cambia a happy cuando HP > 60', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 80,
      mood: 'idle',
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('GOOD', 2000), 2000);

    expect(result.state.mood).toBe('happy');
    expect(result.events).toContainEqual({ type: 'MOOD_CHANGED', mood: 'happy' });
  });

  it('se pone contenta en cuanto la postura es buena, aunque el HP esté bajo', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 25,
      mood: 'sad',
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('GOOD', 1200), 1200);

    expect(result.state.mood).toBe('happy');
    expect(result.events).toContainEqual({ type: 'MOOD_CHANGED', mood: 'happy' });
  });

  it('se pone triste en el primer frame de mala postura', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 100,
      mood: 'happy',
      flowSeconds: 50,
      lastTickAt: 1000,
    };
    const result = tick(state, makeFrame('BAD', 1200), 1200);

    expect(result.state.mood).toBe('sad');
    expect(result.events).toContainEqual({ type: 'MOOD_CHANGED', mood: 'sad' });
  });

  it('recupera HP mientras la postura es buena', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 50,
      mood: 'happy',
      lastTickAt: 1000,
    };
    // dt = 10 s → +5 HP con HP_REGEN_PER_S = 0.5
    const result = tick(state, makeFrame('GOOD', 11000), 11000);

    expect(result.state.hp).toBeCloseTo(55, 5);
  });

  it('la barra de XP arranca vacía justo al subir de nivel', () => {
    // Umbrales acumulativos: nivel 2 empieza exactamente en el umbral del 1.
    const justLeveled = levelThreshold(1);
    const { inLevel, ratio } = xpProgress(justLeveled, 2);

    expect(inLevel).toBe(0);
    expect(ratio).toBe(0);
  });

  it('la barra de XP se llena justo antes de subir de nivel', () => {
    const almostNext = levelThreshold(2) - levelThreshold(1);
    const { ratio } = xpProgress(levelThreshold(2), 2);

    expect(almostNext).toBeGreaterThan(0);
    expect(ratio).toBe(1);
  });

  it('el progreso de XP es proporcional dentro del nivel', () => {
    const prev = levelThreshold(2);
    const needed = levelThreshold(3) - prev;
    const { ratio } = xpProgress(prev + needed / 2, 3);

    expect(ratio).toBeCloseTo(0.5, 5);
  });

  it('el nivel 1 mide el progreso desde cero', () => {
    const { needed, inLevel } = xpProgress(40, 1);

    expect(needed).toBe(levelThreshold(1));
    expect(inLevel).toBe(40);
  });

  it('el progreso de XP nunca sale del rango 0-1', () => {
    expect(xpProgress(-999, 3).ratio).toBe(0);
    expect(xpProgress(999999, 3).ratio).toBe(1);
  });
});
