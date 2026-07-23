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

  // Enviar notificación del sistema
  new Notification('SpineHero — ¡Hito inminente!', {
    body: '¡Faltan 2 minutos para tu próximo hito de Flow!',
  });

  return true;
}
