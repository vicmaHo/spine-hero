import { describe, it, expect } from 'vitest';
import { todayLocalDate } from './dateKey';

describe('todayLocalDate', () => {
  it('formatea con ceros a la izquierda el mes y el día', () => {
    expect(todayLocalDate(new Date(2026, 2, 5, 12, 0))).toBe('2026-03-05');
  });

  it('devuelve la fecha del reloj local, no la UTC, en la madrugada', () => {
    // A las 00:30 locales, la fecha UTC puede ser el día anterior (TZ positivas).
    const madrugada = new Date(2026, 0, 1, 0, 30);
    expect(todayLocalDate(madrugada)).toBe('2026-01-01');
  });

  it('coincide siempre con los getters locales del propio Date', () => {
    const fecha = new Date(2026, 6, 31, 23, 45);
    const esperado = [
      String(fecha.getFullYear()),
      String(fecha.getMonth() + 1).padStart(2, '0'),
      String(fecha.getDate()).padStart(2, '0'),
    ].join('-');
    expect(todayLocalDate(fecha)).toBe(esperado);
  });
});
