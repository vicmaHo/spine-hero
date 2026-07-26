// Motor de juego puro: XP, HP, Flow, logros
import type { GameState, GameEvent, TickResult, PetMood } from '../contracts/game';
import type { PostureFrame } from '../contracts/posture';

export const XP_PER_REWARD = 10;
export const XP_INTERVAL_S = 60;
export const HP_ENTER_BAD = 5;
export const HP_ONGOING_BAD_RATE = 1;       // HP perdido por cada 10s en BAD
export const HP_ONGOING_BAD_INTERVAL_S = 10;
export const HP_REGEN_PER_S = 0.5;          // HP recuperado por segundo en GOOD
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

/**
 * XP acumulado total que hay que alcanzar para superar `level`.
 * Los umbrales son ACUMULATIVOS: 100, 282, 519, 800… No es el coste del
 * nivel, es la marca absoluta de XP. Quien pinte una barra de progreso debe
 * restar el umbral del nivel anterior.
 */
export function levelThreshold(level: number): number {
  return Math.floor(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

export interface XpProgress {
  /** XP conseguido dentro del nivel actual. */
  inLevel: number;
  /** XP que exige el nivel actual de principio a fin. */
  needed: number;
  /** 0-1, listo para multiplicar por el ancho de una barra. */
  ratio: number;
}

/**
 * Progreso dentro del nivel actual, para pintar la barra de XP.
 * Existe aquí y no en cada capa de dibujado porque el HUD del canvas y el
 * dashboard tenían fórmulas distintas y mostraban cifras contradictorias.
 */
export function xpProgress(xp: number, level: number): XpProgress {
  const prev = level > 1 ? levelThreshold(level - 1) : 0;
  const next = levelThreshold(level);
  // max(1) evita dividir por cero si alguien pasa un nivel degenerado.
  const needed = Math.max(1, next - prev);
  const inLevel = Math.max(0, Math.min(needed, xp - prev));
  return { inLevel, needed, ratio: inLevel / needed };
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

  // Marca si el pet acaba de revivir en este tick: entonces el mood queda
  // en 'idle' y no se recalcula, para que la recuperación sea visible.
  let justRevived = false;

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

    // Regeneración de HP mientras la postura es buena. Sin esto el HP solo
    // podía bajar y la mascota nunca volvía a recuperar corazones.
    if (mood !== 'faint') {
      hp += dt * HP_REGEN_PER_S;
    }

    // Recuperación de faint
    if (mood === 'faint' && flowSeconds >= FAINT_RECOVERY_S) {
      hp = FAINT_RECOVERY_HP;
      mood = 'idle';
      justRevived = true;
      events.push({ type: 'REVIVED' });
      events.push({ type: 'MOOD_CHANGED', mood: 'idle' });
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

  }

  // Clamp de HP
  hp = Math.max(0, Math.min(100, hp));

  // Mood: refleja la POSTURA ACTUAL, no solo el HP. Antes se calculaba solo
  // con el HP, así que con mala postura y HP alto la mascota seguía contenta.
  if (hp <= 0) {
    if (mood !== 'faint') {
      mood = 'faint';
      events.push({ type: 'FAINTED' });
      events.push({ type: 'MOOD_CHANGED', mood: 'faint' });
    }
  } else if (mood !== 'faint' && !justRevived) {
    // El mood sigue la postura actual, no el HP: así el feedback es inmediato.
    // El HP ya se comunica con los corazones del HUD.
    const oldMood = mood;
    const desired: PetMood = frame.status === 'BAD' ? 'sad' : 'happy';
    mood = desired;
    if (mood !== oldMood) {
      events.push({ type: 'MOOD_CHANGED', mood });
    }
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
