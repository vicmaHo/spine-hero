import { describe, it, expect, beforeEach, vi } from 'vitest';

// Reseteamos el módulo entre tests para limpiar el estado interno
describe('synth', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('playSound no lanza si AudioContext no se ha creado', async () => {
    const { playSound } = await import('./synth');
    // Sin haber llamado initAudio ni simulado un gesto, no debe lanzar
    expect(() => playSound('LEVEL_UP')).not.toThrow();
  });

  it('playSound es no-op para eventos sin sonido', async () => {
    const { playSound } = await import('./synth');
    expect(() => playSound('XP_GAINED')).not.toThrow();
    expect(() => playSound('MOOD_CHANGED')).not.toThrow();
    expect(() => playSound('FAINTED')).not.toThrow();
    expect(() => playSound('REVIVED')).not.toThrow();
  });

  it('isMuted devuelve false por defecto', async () => {
    const { isMuted } = await import('./synth');
    expect(isMuted()).toBe(false);
  });

  it('setMuted alterna el estado de mute', async () => {
    const { setMuted, isMuted } = await import('./synth');
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  it('setMuted(true) pone gain a 0 cuando existe masterGain', async () => {
    const { MASTER_VOLUME } = await import('./constants');

    // Simulamos un AudioContext mínimo para probar el gain
    const gainValue = { value: MASTER_VOLUME };
    const mockGain = { gain: gainValue, connect: vi.fn() };
    const mockFilter = {
      type: '',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(),
    };

    class MockAudioContext {
      destination = {};
      currentTime = 0;
      createGain() { return mockGain; }
      createBiquadFilter() { return mockFilter; }
    }

    const listeners: Record<string, Function> = {};

    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('document', {
      addEventListener: (event: string, fn: Function) => { listeners[event] = fn; },
      removeEventListener: vi.fn(),
    });

    const { initAudio, setMuted } = await import('./synth');
    initAudio();

    // Simular el gesto del usuario
    listeners['click']();

    // Ahora el AudioContext está creado
    setMuted(true);
    expect(gainValue.value).toBe(0);

    setMuted(false);
    expect(gainValue.value).toBe(MASTER_VOLUME);

    vi.unstubAllGlobals();
  });
});
