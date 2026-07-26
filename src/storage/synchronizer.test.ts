// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProfileRecord } from './db';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  getMock: vi.fn(),
  validateMutationMock: vi.fn(),
  streakListMock: vi.fn(),
  streakUpdateMock: vi.fn(),
  streakCreateMock: vi.fn(),
  getDayMock: vi.fn(),
  getProfileMock: vi.fn(),
  getSyncedRecordIdMock: vi.fn(),
  setSyncedRecordIdMock: vi.fn(),
  fetchAuthSessionMock: vi.fn(),
  fetchUserAttributesMock: vi.fn(),
}));

vi.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      DailyRecord: { create: h.createMock, update: h.updateMock, get: h.getMock },
      Streak: {
        list: h.streakListMock,
        update: h.streakUpdateMock,
        create: h.streakCreateMock,
      },
    },
    mutations: {
      validateAndUpdateDailyRecord: h.validateMutationMock,
    },
  }),
}));

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: h.fetchAuthSessionMock,
  fetchUserAttributes: h.fetchUserAttributesMock,
}));

vi.mock('./db', () => ({
  getDay: h.getDayMock,
  getProfile: h.getProfileMock,
  getSyncedRecordId: h.getSyncedRecordIdMock,
  setSyncedRecordId: h.setSyncedRecordIdMock,
}));

import { createSynchronizer } from './synchronizer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(): ProfileRecord {
  return {
    gameState: {
      xp: 120,
      level: 3,
      hp: 100,
      flowSeconds: 130,
      goodSecondsToday: 0,
      mood: 'idle',
      achievements: [],
      streakDays: 0,
      lastTickAt: 0,
    },
    calibration: null,
    teamCode: 'ABCD',
  };
}

/** Vacía la cola de microtareas para que corran los awaits de un syncNow disparado con `void`. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();

  // Autenticado por defecto
  h.fetchAuthSessionMock.mockResolvedValue({ tokens: {} });
  h.fetchUserAttributesMock.mockResolvedValue({ email: 'yo@example.com' });

  // Datos locales por defecto
  h.getDayMock.mockResolvedValue([]);
  h.getProfileMock.mockResolvedValue(makeProfile());
  h.getSyncedRecordIdMock.mockResolvedValue(null);
  h.setSyncedRecordIdMock.mockResolvedValue(undefined);

  // Respuestas de la nube por defecto
  h.createMock.mockResolvedValue({ data: { id: 'rec-1' }, errors: undefined });
  h.updateMock.mockResolvedValue({ data: { id: 'rec-1' }, errors: undefined });
  h.getMock.mockResolvedValue({
    data: { id: 'rec-1', goodPostureSeconds: 100, updatedAt: new Date().toISOString() },
    errors: undefined,
  });
  h.validateMutationMock.mockResolvedValue({ data: { id: 'rec-1' }, errors: undefined });
  h.streakListMock.mockResolvedValue({ data: [] });
  h.streakCreateMock.mockResolvedValue({ data: {}, errors: undefined });
  h.streakUpdateMock.mockResolvedValue({ data: {}, errors: undefined });

  // Navegador online
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('synchronizer · upsert de DailyRecord', () => {
  it('primer sync sin id previo: CREA y guarda el id devuelto', async () => {
    const sync = createSynchronizer();
    await sync.syncNow();

    expect(h.createMock).toHaveBeenCalledOnce();
    expect(h.updateMock).not.toHaveBeenCalled();
    expect(h.setSyncedRecordIdMock).toHaveBeenCalledWith(expect.any(String), 'rec-1');
  });

  it('sync con id previo: ACTUALIZA ese registro y no crea otro', async () => {
    h.getSyncedRecordIdMock.mockResolvedValue('rec-1');

    const sync = createSynchronizer();
    await sync.syncNow();

    expect(h.updateMock).toHaveBeenCalledOnce();
    expect(h.updateMock.mock.calls[0][0]).toMatchObject({ id: 'rec-1' });
    expect(h.createMock).not.toHaveBeenCalled();
    expect(h.setSyncedRecordIdMock).not.toHaveBeenCalled();
  });

  it('reintenta con backoff si el create falla y luego lo consigue', async () => {
    h.createMock
      .mockRejectedValueOnce(new Error('red caída'))
      .mockResolvedValueOnce({ data: { id: 'rec-2' }, errors: undefined });

    const sync = createSynchronizer({ baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.createMock).toHaveBeenCalledTimes(2);
    expect(h.setSyncedRecordIdMock).toHaveBeenCalledWith(expect.any(String), 'rec-2');
  });
});

describe('synchronizer · validación anti-trampa', () => {
  beforeEach(() => {
    h.getSyncedRecordIdMock.mockResolvedValue('rec-1');
  });

  it('persiste el update cuando el servidor valida el checkpoint', async () => {
    const sync = createSynchronizer({ baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.validateMutationMock).toHaveBeenCalled();
    expect(h.updateMock).toHaveBeenCalledOnce();
  });

  it('descarta el checkpoint sin persistirlo si el servidor lo rechaza por trampa', async () => {
    h.validateMutationMock.mockResolvedValue({
      data: null,
      errors: [{ message: 'ANTICHEAT_REJECT: incremento de 5000s excede los 300s permitidos' }],
    });

    const sync = createSynchronizer({ baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.updateMock).not.toHaveBeenCalled();
  });

  it('persiste el update si la validación no está desplegada (error sin token)', async () => {
    h.validateMutationMock.mockResolvedValue({
      data: null,
      errors: [{ message: 'Cannot query field validateAndUpdateDailyRecord' }],
    });

    const sync = createSynchronizer({ baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.updateMock).toHaveBeenCalledOnce();
  });

  it('persiste el update si la validación lanza excepción (red caída)', async () => {
    h.validateMutationMock.mockRejectedValue(new Error('red caída'));

    const sync = createSynchronizer({ baseRetryMs: 1 });
    await sync.syncNow();

    expect(h.updateMock).toHaveBeenCalledOnce();
  });
});

describe('synchronizer · guards', () => {
  it('no envía si no hay red', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const sync = createSynchronizer();
    await sync.syncNow();

    expect(h.createMock).not.toHaveBeenCalled();
    expect(h.updateMock).not.toHaveBeenCalled();
  });

  it('no envía si no hay sesión autenticada', async () => {
    h.fetchAuthSessionMock.mockResolvedValue({ tokens: undefined });

    const sync = createSynchronizer();
    await sync.syncNow();

    expect(h.createMock).not.toHaveBeenCalled();
  });

  it('dos syncNow concurrentes solo producen un envío (anti-solape)', async () => {
    // create lento para que el segundo syncNow entre mientras el primero corre
    h.createMock.mockImplementation(
      () => new Promise((res) => setTimeout(() => res({ data: { id: 'rec-1' }, errors: undefined }), 10)),
    );

    const sync = createSynchronizer();
    const p1 = sync.syncNow();
    const p2 = sync.syncNow();
    await Promise.all([p1, p2]);

    expect(h.createMock).toHaveBeenCalledOnce();
  });
});

describe('synchronizer · start/stop', () => {
  it('start() dispara un sync inmediato (no espera al intervalo)', async () => {
    const sync = createSynchronizer();
    sync.start();
    await vi.waitFor(() => expect(h.createMock).toHaveBeenCalledOnce());
    sync.stop();
  });

  it('tras stop() ya no sincroniza al reconectar', async () => {
    const sync = createSynchronizer();
    sync.start();
    await vi.waitFor(() => expect(h.createMock).toHaveBeenCalledOnce());
    sync.stop();
    h.createMock.mockClear();

    window.dispatchEvent(new Event('online'));
    await flush();

    expect(h.createMock).not.toHaveBeenCalled();
  });
});
