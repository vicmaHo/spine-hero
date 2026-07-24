import type { Checkpoint } from '../contracts/sync';
import type { MinuteEntry, ProfileRecord } from './db';

/**
 * Agrega las entradas de minuto y el perfil del usuario en un Checkpoint
 * listo para sincronizar con el backend.
 * Función pura: sin DOM, sin efectos, sin Date.now().
 */
export function buildCheckpoint(
  date: string,
  minutes: MinuteEntry[],
  profile: ProfileRecord,
  teamCode?: string,
): Checkpoint {
  const goodPostureSeconds = minutes.reduce((sum, m) => sum + m.goodSeconds, 0);

  const avgScore =
    minutes.length > 0
      ? Math.round(minutes.reduce((sum, m) => sum + m.avgScore, 0) / minutes.length)
      : 0;

  const longestFlowStreak = Math.floor(profile.gameState.flowSeconds / 60);

  return {
    date,
    goodPostureSeconds,
    longestFlowStreak,
    avgScore,
    level: profile.gameState.level,
    xp: profile.gameState.xp,
    ...(teamCode !== undefined && { teamCode }),
  };
}
