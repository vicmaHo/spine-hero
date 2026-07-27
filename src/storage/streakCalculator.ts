export interface StreakState {
  currentDays: number;
  bestDays: number;
  lastActiveDate: string; // YYYY-MM-DD
}

/**
 * Calcula el nuevo estado de racha dado el estado existente y la fecha actual.
 * Función pura: sin DOM, sin efectos, sin Date.now().
 * El parámetro `today` se pasa desde fuera en formato YYYY-MM-DD.
 */
export function computeStreakUpdate(
  existing: StreakState | null,
  today: string,
): StreakState {
  // Primer uso: no hay estado previo
  if (existing === null) {
    return { currentDays: 1, bestDays: 1, lastActiveDate: today };
  }

  // Ya sincronizado hoy: no-op
  if (existing.lastActiveDate === today) {
    return existing;
  }

  const yesterday = getYesterday(today);

  // Día consecutivo: incrementar racha
  if (existing.lastActiveDate === yesterday) {
    const currentDays = existing.currentDays + 1;
    const bestDays = Math.max(existing.bestDays, currentDays);
    return { currentDays, bestDays, lastActiveDate: today };
  }

  // Más de un día sin actividad: reset, preservar bestDays
  return { currentDays: 1, bestDays: existing.bestDays, lastActiveDate: today };
}

/** Deriva la fecha de ayer a partir de `today` (formato YYYY-MM-DD). */
function getYesterday(today: string): string {
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
