/**
 * Siembra del acarreo del día desde la nube.
 *
 * El cierre de sesión vacía los minutos locales (`clearAllLocalUserData`). Al
 * volver a entrar el mismo día con el mismo nick, el cliente arranca en 0 y su
 * fila del ranking se quedaría congelada hasta remontar los segundos que la
 * nube ya tenía. Esto lee ese total una sola vez, en el momento de conceder el
 * acceso, y lo guarda como acarreo para que `buildCheckpoint` lo sume.
 *
 * Solo se invoca al conceder el acceso (alta o acceso con nick), nunca al
 * arrancar con una sesión ya iniciada ni al cambiar de nick: en esos casos los
 * minutos locales están intactos y ya están incluidos en el valor de la nube,
 * así que sembrar el acarreo contaría dos veces lo mismo.
 *
 * Best-effort: si la consulta falla o no hay red, el acarreo se queda en 0 y la
 * fila sigue protegida por el suelo monótono del Validador_AntiTrampa.
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { setDayCarrySeconds } from './db';

// `authMode` explícito: las Credenciales_Invitado son las únicas que usa la app.
const client = generateClient<Schema>({ authMode: 'identityPool' });

/**
 * Lee de la nube los segundos de buena postura ya registrados por `nick` en
 * `date` y los guarda como acarreo local. No devuelve nada: si algo falla, no
 * hay acarreo y punto.
 */
export async function seedDayCarryFromCloud(nick: string, date: string): Promise<void> {
  try {
    const { data, errors } = await client.models.DailyRecord.listByNameAndDate(
      { displayName: nick, date: { eq: date } },
      { selectionSet: ['goodPostureSeconds'] as const },
    );

    if (errors?.length) return;

    // Máximo y no suma: si por lo que sea hubiera más de una fila de ese nick
    // ese día, sumarlas inflaría el total y lo dejaría sin relación con lo que
    // el ranking muestra.
    const carried = data.reduce((max, row) => Math.max(max, row.goodPostureSeconds), 0);
    if (carried > 0) await setDayCarrySeconds(date, carried);
  } catch {
    // Sin red o sin permisos: se sigue sin acarreo.
  }
}
