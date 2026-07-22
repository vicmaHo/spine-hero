import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleProfileSave, flushNow, DEBOUNCE_MS } from './profileDebounce';
import type { ProfileRecord } from './profileStore';

vi.mock('./profileStore', () => ({
  saveProfile: vi.fn(),
}));

import { saveProfile } from './profileStore';

const mockSave = vi.mocked(saveProfile);

function makeRecord(xp: number): ProfileRecord {
  return {
    gameState: {
      xp,
      level: 1,
      hp: 100,
      flowSeconds: 0,
      goodSecondsToday: 0,
      mood: 'idle',
      achievements: [],
      streakDays: 0,
      lastTickAt: 0,
    },
    calibration: null,
  };
}

describe('profileDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSave.mockClear();
  });

  afterEach(() => {
    // Limpiar timers pendientes entre tests
    flushNow();
    vi.useRealTimers();
  });

  it('no escribe inmediatamente al agendar', () => {
    scheduleProfileSave(makeRecord(10));
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('escribe después de DEBOUNCE_MS', () => {
    const record = makeRecord(20);
    scheduleProfileSave(record);

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(record);
  });

  it('solo guarda el último registro si se agenda varias veces', () => {
    scheduleProfileSave(makeRecord(1));
    scheduleProfileSave(makeRecord(2));
    scheduleProfileSave(makeRecord(3));

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(makeRecord(3));
  });

  it('no reinicia el timer en llamadas sucesivas', () => {
    scheduleProfileSave(makeRecord(1));

    vi.advanceTimersByTime(3000);
    scheduleProfileSave(makeRecord(2));

    // A los 5s desde la primera llamada, debería disparar
    vi.advanceTimersByTime(2000);

    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(makeRecord(2));
  });

  it('flushNow escribe inmediatamente el pendiente', () => {
    scheduleProfileSave(makeRecord(50));

    flushNow();

    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(makeRecord(50));
  });

  it('flushNow cancela el timer pendiente', () => {
    scheduleProfileSave(makeRecord(50));
    flushNow();
    mockSave.mockClear();

    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(mockSave).not.toHaveBeenCalled();
  });

  it('flushNow no hace nada si no hay pendiente', () => {
    flushNow();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('permite un nuevo ciclo de debounce tras el flush', () => {
    scheduleProfileSave(makeRecord(1));
    vi.advanceTimersByTime(DEBOUNCE_MS);
    mockSave.mockClear();

    scheduleProfileSave(makeRecord(2));
    vi.advanceTimersByTime(DEBOUNCE_MS);

    expect(mockSave).toHaveBeenCalledOnce();
    expect(mockSave).toHaveBeenCalledWith(makeRecord(2));
  });
});
