// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, cleanup } from '@testing-library/react';
import { PerfPanel } from '../PerfPanel';
import { usePerfStats } from '../usePerfStats';
import type { PerfStats } from '../perfStats';

/** Crea un PerfStats falso con las cuatro lecturas que consume el panel. */
function makeStats(values: { p50?: number; p95?: number; fps?: number; dropped?: number }): PerfStats {
  const { p50 = 0, p95 = 0, fps = 0, dropped = 0 } = values;
  return {
    getP50: vi.fn(() => p50),
    getP95: vi.fn(() => p95),
    getFps: vi.fn(() => fps),
    getDropped: vi.fn(() => dropped),
  } as unknown as PerfStats;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Restaurar visibilidad por defecto para no contaminar otros tests.
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

describe('PerfPanel · render', () => {
  it('muestra las métricas del PerfStats', () => {
    render(<PerfPanel stats={makeStats({ p50: 12, p95: 20, fps: 4.8, dropped: 1 })} />);
    const panel = screen.getByLabelText('Panel de rendimiento');
    expect(panel.textContent).toContain('12.0 ms');
    expect(panel.textContent).toContain('4.8');
    expect(panel.textContent).toContain('Dropped');
  });

  it('muestra el badge HEALTHY con buenas métricas', () => {
    render(<PerfPanel stats={makeStats({ p50: 10, p95: 15, fps: 5, dropped: 0 })} />);
    expect(screen.getByText('HEALTHY')).toBeTruthy();
  });

  it('muestra el badge CRITICAL con animate-pulse cuando el FPS es bajo', () => {
    render(<PerfPanel stats={makeStats({ p95: 15, fps: 2, dropped: 0 })} />);
    const label = screen.getByText('CRITICAL');
    const dot = label.previousElementSibling;
    expect(dot?.className).toContain('animate-pulse');
    expect(dot?.className).toContain('bg-red-500');
  });

  it('muestra IDLE (sin datos) al arrancar sin mediciones', () => {
    render(<PerfPanel stats={makeStats({})} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('PerfPanel · copiado', () => {
  it('copia Markdown al portapapeles y confirma visualmente', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<PerfPanel stats={makeStats({ p50: 12, p95: 20, fps: 4.8, dropped: 1 })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('## Benchmark');
    expect(writeText.mock.calls[0][0]).toContain('| p50 | 12.0 ms |');
    expect(screen.getByRole('button').textContent).toContain('¡Copiado!');
  });

  it('cae al fallback execCommand si la Clipboard API no está disponible', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const exec = vi.fn().mockReturnValue(true);
    document.execCommand = exec as unknown as typeof document.execCommand;

    render(<PerfPanel stats={makeStats({ fps: 5, p95: 15 })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(exec).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button').textContent).toContain('¡Copiado!');
  });

  it('anuncia el copiado en una región aria-live para lectores de pantalla', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<PerfPanel stats={makeStats({ fps: 5, p95: 15 })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    const live = screen.getByRole('status', { name: '' });
    // La región con aria-live contiene el anuncio (no el badge de salud).
    const announcement = screen
      .getAllByRole('status')
      .map((el) => el.textContent)
      .join(' ');
    expect(announcement).toContain('copiadas al portapapeles');
    expect(live).toBeTruthy();
  });

  it('la confirmación vuelve a "Copiar" tras 2 segundos', async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      render(<PerfPanel stats={makeStats({ fps: 5, p95: 15 })} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button'));
      });
      expect(screen.getByRole('button').textContent).toContain('¡Copiado!');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole('button').textContent).toBe('Copiar');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('usePerfStats · Visibility API', () => {
  it('pausa el sondeo cuando la pestaña se oculta y lo reanuda al volver', () => {
    vi.useFakeTimers();
    try {
      const stats = makeStats({ p50: 10, p95: 15, fps: 5, dropped: 0 });
      renderHook(() => usePerfStats(stats, 500));

      // El tick inicial ya leyó las métricas.
      const afterMount = vi.mocked(stats.getP50).mock.calls.length;
      expect(afterMount).toBeGreaterThan(0);

      // Ocultar la pestaña: el polling debe detenerse.
      act(() => {
        Object.defineProperty(document, 'hidden', { value: true, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const afterHide = vi.mocked(stats.getP50).mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(vi.mocked(stats.getP50).mock.calls.length).toBe(afterHide);

      // Volver a primer plano: el polling se reanuda (nuevo tick inmediato).
      act(() => {
        Object.defineProperty(document, 'hidden', { value: false, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(vi.mocked(stats.getP50).mock.calls.length).toBeGreaterThan(afterHide);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sondea en cada intervalo mientras la pestaña está visible', () => {
    vi.useFakeTimers();
    try {
      const stats = makeStats({ p50: 10, p95: 15, fps: 5, dropped: 0 });
      renderHook(() => usePerfStats(stats, 500));

      const afterMount = vi.mocked(stats.getP50).mock.calls.length;
      act(() => {
        vi.advanceTimersByTime(1500); // 3 intervalos
      });
      expect(vi.mocked(stats.getP50).mock.calls.length).toBeGreaterThan(afterMount);
    } finally {
      vi.useRealTimers();
    }
  });
});
