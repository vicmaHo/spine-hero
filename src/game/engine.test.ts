import { describe, it, expect } from 'vitest';
import {
  tick,
  XP_PER_REWARD,
  HP_ENTER_BAD,
  FAINT_RECOVERY_S,
  FAINT_RECOVERY_HP,
  FLOW_MILESTONES_MIN,
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
  it('60 s en GOOD otorga +10 XP', () => {
    const state: GameState = { ...INITIAL_GAME_STATE, lastTickAt: 1000, goodSecondsToday: 0 };
    const result = tick(state, makeFrame('GOOD', 61000), 61000);

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
    // Nivel 1, threshold = floor(100 * 1^1.5) = 100
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      level: 1,
      xp: 90,
      goodSecondsToday: 59,
      lastTickAt: 1000,
    };
    // dt = 1s → goodSecondsToday llega a 60 → +10 XP → total 100 → level up
    const result = tick(state, makeFrame('GOOD', 2000), 2000);

    expect(result.state.xp).toBe(100);
    expect(result.state.level).toBe(2);
    expect(result.events).toContainEqual({ type: 'LEVEL_UP', level: 2 });
  });

  it('hito de Flow a 25 min emite FLOW_MILESTONE', () => {
    const justBelow = FLOW_MILESTONES_MIN[0] * 60 - 1; // 1499
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      flowSeconds: justBelow,
      lastTickAt: 1000,
    };
    // dt = 2s → flowSeconds = 1501 (> 1500)
    const result = tick(state, makeFrame('GOOD', 3000), 3000);

    expect(result.events).toContainEqual({ type: 'FLOW_MILESTONE', minutes: 25 });
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

  it('logro Espalda de Acero a 25 min de Flow', () => {
    const justBelow = 25 * 60 - 1;
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      flowSeconds: justBelow,
      lastTickAt: 1000,
    };
    // dt = 2s → flowSeconds cruza 25*60
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

  it('mood cambia a sad cuando HP <= 30', () => {
    const state: GameState = {
      ...INITIAL_GAME_STATE,
      hp: 25,
      mood: 'idle',
      lastTickAt: 1000,
    };
    // dt corto, no hay cambio de HP significativo
    const result = tick(state, makeFrame('GOOD', 1100), 1100);

    expect(result.state.mood).toBe('sad');
    expect(result.events).toContainEqual({ type: 'MOOD_CHANGED', mood: 'sad' });
  });
});
