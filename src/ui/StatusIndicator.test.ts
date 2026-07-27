import { describe, it, expect } from 'vitest';
import { scoreBarColor, SCORE_TRANSITION_START } from './StatusIndicator';

describe('scoreBarColor', () => {
  it('es verde pleno en el umbral y por encima', () => {
    const green = 'hsl(120, 70%, 45%)';
    expect(scoreBarColor(100)).toBe(green);
    expect(scoreBarColor(60)).toBe(green);
    expect(scoreBarColor(SCORE_TRANSITION_START)).toBe(green);
  });

  it('es rojo pleno en score 0', () => {
    expect(scoreBarColor(0)).toBe('hsl(0, 70%, 45%)');
  });

  it('pasa por amarillo a mitad del rango de transición', () => {
    // score 15 → ratio 0.5 → hue 60 (amarillo)
    expect(scoreBarColor(15)).toBe('hsl(60, 70%, 45%)');
  });

  it('se vuelve más rojo cuanto peor la postura', () => {
    const hue = (s: number) => Number(scoreBarColor(s).match(/hsl\((\d+)/)![1]);
    // Menor score → menor tono → más cerca del rojo
    expect(hue(25)).toBeGreaterThan(hue(15));
    expect(hue(15)).toBeGreaterThan(hue(5));
  });

  it('clampa valores fuera de rango', () => {
    expect(scoreBarColor(-10)).toBe('hsl(0, 70%, 45%)');
    expect(scoreBarColor(999)).toBe('hsl(120, 70%, 45%)');
  });
});
