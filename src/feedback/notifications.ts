import { FLOW_NOTIFY_AHEAD } from './constants';

// Constante local que re-exporta el valor para claridad en este módulo
export const FLOW_NOTIFY_AHEAD_SECONDS = FLOW_NOTIFY_AHEAD;

/**
 * Solicita permiso de notificaciones al usuario.
 * Wrapper sobre Notification.requestPermission() para facilitar el testing.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission();
}

/**
 * Comprueba si se debe enviar una notificación de hito inminente y, si procede, la envía.
 *
 * Devuelve true si se envió la notificación, false en caso contrario.
 *
 * Condiciones para enviar:
 * - El permiso de notificaciones está concedido
 * - No se ha notificado ya este hito (alreadyNotified === false)
 * - flowSeconds >= nextMilestoneSeconds - FLOW_NOTIFY_AHEAD
 */
export function checkAndNotifyFlowMilestone(
  flowSeconds: number,
  nextMilestoneSeconds: number,
  alreadyNotified: boolean,
): boolean {
  if (alreadyNotified) return false;
  if (Notification.permission !== 'granted') return false;
  if (flowSeconds < nextMilestoneSeconds - FLOW_NOTIFY_AHEAD) return false;

  // El texto se deriva de la constante para que no mienta si se ajusta
  // la ventana de aviso (los umbrales de demo la bajan a 30 s).
  const ahead = FLOW_NOTIFY_AHEAD;
  const label = ahead >= 60 ? `${Math.round(ahead / 60)} min` : `${ahead} s`;

  new Notification('SpineHero — ¡Hito inminente!', {
    body: `¡Faltan ${label} para tu próximo hito de Flow!`,
  });

  return true;
}
