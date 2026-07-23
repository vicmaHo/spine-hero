import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkAndNotifyFlowMilestone,
  requestNotificationPermission,
  FLOW_NOTIFY_AHEAD_SECONDS,
} from './notifications';

// Mock global de Notification
const mockNotificationConstructor = vi.fn();

beforeEach(() => {
  // Simular Notification como clase global
  vi.stubGlobal('Notification', class {
    constructor(title: string, options?: NotificationOptions) {
      mockNotificationConstructor(title, options);
    }
    static permission: NotificationPermission = 'granted';
    static requestPermission = vi.fn().mockResolvedValue('granted' as NotificationPermission);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockNotificationConstructor.mockClear();
});

describe('requestNotificationPermission', () => {
  it('delega en Notification.requestPermission()', async () => {
    const result = await requestNotificationPermission();
    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(result).toBe('granted');
  });
});

describe('checkAndNotifyFlowMilestone', () => {
  it('envía notificación cuando flowSeconds alcanza la ventana de aviso', () => {
    // Hito en 300s (5 min), ventana = 300 - 120 = 180s
    const sent = checkAndNotifyFlowMilestone(180, 300, false);
    expect(sent).toBe(true);
    expect(mockNotificationConstructor).toHaveBeenCalledWith(
      'SpineHero — ¡Hito inminente!',
      { body: '¡Faltan 2 minutos para tu próximo hito de Flow!' },
    );
  });

  it('no envía si flowSeconds está por debajo de la ventana', () => {
    // 179s < 300 - 120 = 180s
    const sent = checkAndNotifyFlowMilestone(179, 300, false);
    expect(sent).toBe(false);
    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it('no envía si alreadyNotified es true', () => {
    const sent = checkAndNotifyFlowMilestone(200, 300, true);
    expect(sent).toBe(false);
    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it('no envía si el permiso no está concedido', () => {
    // Cambiar permiso a 'denied'
    Object.defineProperty(Notification, 'permission', { value: 'denied', writable: true });
    const sent = checkAndNotifyFlowMilestone(200, 300, false);
    expect(sent).toBe(false);
    expect(mockNotificationConstructor).not.toHaveBeenCalled();
  });

  it('envía justo en el límite exacto de la ventana', () => {
    // Exactamente en nextMilestone - FLOW_NOTIFY_AHEAD
    const sent = checkAndNotifyFlowMilestone(
      900 - FLOW_NOTIFY_AHEAD_SECONDS,
      900,
      false,
    );
    expect(sent).toBe(true);
  });

  it('envía cuando flowSeconds supera el hito (ya pasó la ventana)', () => {
    // flowSeconds > nextMilestone, sigue en ventana
    const sent = checkAndNotifyFlowMilestone(310, 300, false);
    expect(sent).toBe(true);
  });
});
