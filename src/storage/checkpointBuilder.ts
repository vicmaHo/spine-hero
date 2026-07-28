import type { Checkpoint } from '../contracts/sync';
import type { MinuteEntry, ProfileRecord } from './db';

/**
 * Racha de flow más larga del día, en minutos completos.
 *
 * Se calcula sobre las entradas de minuto persistidas, no sobre
 * `GameState.flowSeconds`: ese campo es la racha **en curso** y el motor lo
 * resetea a 0 en cuanto la postura se degrada, así que leerlo en el instante de
 * la sincronización daba casi siempre un valor sin relación con el mejor tramo
 * del día.
 *
 * Una racha es un grupo de minutos **consecutivos** (sin huecos en el número de
 * minuto) cuyo `dominantStatus` es `GOOD`. Su longitud es la suma de los
 * `goodSeconds` reales de esos minutos, no el número de minutos que ocupa: un
 * minuto puede ser GOOD dominante con solo 31 de 300 frames buenos, y contarlo
 * como 60 segundos inflaría el valor por encima de `goodPostureSeconds`, que es
 * justo lo que la regla `FLOW_VS_GOOD` del Validador_AntiTrampa rechaza. Al
 * sumar segundos reales de un subconjunto de los minutos del día, el resultado
 * nunca puede superar el total diario.
 *
 * Función pura y sin dependencia del orden de `minutes`.
 */
export function longestFlowStreakMinutes(minutes: MinuteEntry[]): number {
  const byMinute = [...minutes].sort((a, b) => a.minute - b.minute);

  let bestSeconds = 0;
  let runSeconds = 0;
  let previousMinute: number | null = null;

  for (const entry of byMinute) {
    if (entry.dominantStatus !== 'GOOD') {
      // Un minuto malo corta la racha, pero sigue siendo el minuto anterior
      // para efectos de contigüidad.
      runSeconds = 0;
      previousMinute = entry.minute;
      continue;
    }

    const isContiguous = previousMinute !== null && entry.minute === previousMinute + 1;
    runSeconds = isContiguous ? runSeconds + entry.goodSeconds : entry.goodSeconds;
    bestSeconds = Math.max(bestSeconds, runSeconds);
    previousMinute = entry.minute;
  }

  return Math.floor(bestSeconds / 60);
}

/**
 * Agrega las entradas de minuto y el perfil del usuario en un Checkpoint
 * listo para sincronizar con el backend.
 * Función pura: sin DOM, sin efectos, sin Date.now().
 *
 * `carriedGoodSeconds` son los segundos que la nube ya tenía para este nick y
 * esta fecha cuando se concedió el acceso (ver `DayCarryRecord`). Se suman solo
 * a `goodPostureSeconds`: `avgScore` es la media de los minutos realmente
 * medidos en local, y `longestFlowStreak` es un máximo que el
 * Validador_AntiTrampa ya conserva del lado servidor.
 */
export function buildCheckpoint(
  date: string,
  minutes: MinuteEntry[],
  profile: ProfileRecord,
  teamCode?: string,
  carriedGoodSeconds = 0,
): Checkpoint {
  const goodPostureSeconds =
    carriedGoodSeconds + minutes.reduce((sum, m) => sum + m.goodSeconds, 0);

  const avgScore =
    minutes.length > 0
      ? Math.round(minutes.reduce((sum, m) => sum + m.avgScore, 0) / minutes.length)
      : 0;

  const longestFlowStreak = longestFlowStreakMinutes(minutes);

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
