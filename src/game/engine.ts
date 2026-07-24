// Motor de juego puro: XP, HP, Flow, logros
import type { GameState, GameEvent, TickResult } from '../contracts/game';
import type { PostureFrame } from '../contracts/posture';

export const XP_PER_REWARD = 10;
export const XP_INTERVAL_S = 60;
export const HP_ENTER_BAD = 5;
export const HP_ONGOING_BAD_RATE = 1;       // HP perdido por cada 10s en BAD
export const HP_ONGOING_BAD_INTERVAL_S = 10;
export const FAINT_RECOVERY_S = 300;        // 5 min en GOOD para recuperar
export const FAINT_RECOVERY_HP = 20;
export const FLOW_MILESTONES_MIN = [25, 50, 90];
export const LEVEL_EXPONENT = 1.5;
export const LEVEL_BASE_XP = 100;

export const ACHIEVEMENTS = [
  { id: 'espalda_de_acero', label: 'Espalda de Acero', flowMin: 25 },
  { id: 'lord_clean_code', label: 'Lord del Clean Code', flowMin: 90 },
  { id: 'constante', label: 'Constante', streakDays: 3 },
] as const;

/** Calcula el XP necesario para subir del nivel actual */
function levelThreshold(level: number): number {
  return Math.floor(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

export function tick(state: GameState, frame: PostureFrame, now: number): TickResult {
  const events: GameEvent[] = [];

  // Calcular dt en segundos
  const dt = state.lastTickAt === 0 ? 0 : (now - state.lastTickAt) / 1000;

  // AWAY, LOW_CONF o CALIBRATING: congelar todo
  if (frame.status === 'AWAY' || frame.status === 'LOW_CONF' || frame.status === 'CALIBRATING') {
    return { state: { ...state, lastTickAt: now }, events: [] };
  }

  // Copia mutable del estado
  let { xp, level, hp, flowSeconds, goodSecondsToday, mood, achievements, streakDays } = state;

  if (frame.status === 'GOOD') {
    // Acumular flow y segundos buenos
    const oldFlowSeconds = flowSeconds;
    const oldGoodSecondsToday = goodSecondsToday;
    flowSeconds += dt;
    goodSecondsToday += dt;

    // Recompensa de XP cada XP_INTERVAL_S segundos acumulados en GOOD
    const oldIntervals = Math.floor(oldGoodSecondsToday / XP_INTERVAL_S);
    const newIntervals = Math.floor(goodSecondsToday / XP_INTERVAL_S);
    if (newIntervals > oldIntervals) {
      const gained = XP_PER_REWARD * (newIntervals - oldIntervals);
      xp += gained;
      events.push({ type: 'XP_GAINED', amount: gained });
    }

    // Subida de nivel
    let threshold = levelThreshold(level);
    while (xp >= threshold) {
      level++;
      events.push({ type: 'LEVEL_UP', level });
      threshold = levelThreshold(level);
    }

    // Hitos de Flow
    for (const milestone of FLOW_MILESTONES_MIN) {
      const milestoneSeconds = milestone * 60;
      if (oldFlowSeconds < milestoneSeconds && flowSeconds >= milestoneSeconds) {
        events.push({ type: 'FLOW_MILESTONE', minutes: milestone });
      }
    }

    // Recuperación de faint
    let justRevived = false;
    if (mood === 'faint' && flowSeconds >= FAINT_RECOVERY_S) {
      hp = FAINT_RECOVERY_HP;
      mood = 'idle';
      justRevived = true;
      events.push({ type: 'REVIVED' });
      events.push({ type: 'MOOD_CHANGED', mood: 'idle' });
    }

    // Cambio de mood (solo si no está en faint y no acaba de revivir)
    if (mood !== 'faint' && !justRevived) {
      const oldMood = mood;
      if (hp > 60) mood = 'happy';
      else if (hp > 30) mood = 'idle';
      else mood = 'sad';
      if (mood !== oldMood) {
        events.push({ type: 'MOOD_CHANGED', mood });
      }
    }
  }

  if (frame.status === 'BAD') {
    if (state.flowSeconds > 0) {
      // Entrando en BAD desde GOOD: penalización de entrada
      hp -= HP_ENTER_BAD;
      events.push({ type: 'HP_LOST', amount: HP_ENTER_BAD });
      flowSeconds = 0;
    } else {
      // Continuando en BAD: daño proporcional al tiempo
      const hpLoss = dt * (HP_ONGOING_BAD_RATE / HP_ONGOING_BAD_INTERVAL_S);
      if (hpLoss > 0) {
        hp -= hpLoss;
        events.push({ type: 'HP_LOST', amount: Math.round(hpLoss * 100) / 100 });
      }
    }

    // Cambio de mood en BAD (misma lógica)
    if (mood !== 'faint') {
      const oldMood = mood;
      if (hp > 60) mood = 'happy';
      else if (hp > 30) mood = 'idle';
      else mood = 'sad';
      if (mood !== oldMood) {
        events.push({ type: 'MOOD_CHANGED', mood });
      }
    }
  }

  // Clamp de HP
  hp = Math.max(0, Math.min(100, hp));

  // Comprobar faint
  if (hp <= 0 && mood !== 'faint') {
    mood = 'faint';
    events.push({ type: 'FAINTED' });
    events.push({ type: 'MOOD_CHANGED', mood: 'faint' });
  }

  // Logros (se comprueban al final, tanto en GOOD como BAD)
  const newAchievements = [...achievements];

  for (const ach of ACHIEVEMENTS) {
    if (newAchievements.includes(ach.id)) continue;

    if ('flowMin' in ach && flowSeconds >= ach.flowMin * 60) {
      newAchievements.push(ach.id);
      events.push({ type: 'ACHIEVEMENT', id: ach.id, label: ach.label });
    }
    if ('streakDays' in ach && streakDays >= ach.streakDays) {
      newAchievements.push(ach.id);
      events.push({ type: 'ACHIEVEMENT', id: ach.id, label: ach.label });
    }
  }

  return {
    state: {
      xp,
      level,
      hp,
      flowSeconds,
      goodSecondsToday,
      mood,
      achievements: newAchievements,
      streakDays,
      lastTickAt: now,
    },
    events,
  };
}
