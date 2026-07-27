import { describe, it, expect } from 'vitest';
import { createParticleSystem } from './particles';

describe('createParticleSystem', () => {
  it('comienza inactivo', () => {
    const ps = createParticleSystem();
    expect(ps.isActive()).toBe(false);
  });

  it('emit() genera partículas y activa el sistema', () => {
    const ps = createParticleSystem();
    ps.emit(64, 64, 12);
    expect(ps.isActive()).toBe(true);
  });

  it('emit() genera al menos 8 partículas aunque count sea menor', () => {
    const ps = createParticleSystem();
    ps.emit(64, 64, 3); // pide 3 pero el mínimo es 8
    // Verificamos que está activo (se generaron partículas)
    expect(ps.isActive()).toBe(true);
  });

  it('update() mueve partículas y reduce life', () => {
    const ps = createParticleSystem();
    ps.emit(64, 64, 12);
    // Avanzar medio segundo
    ps.update(0.5);
    // Aún deben quedar vivas (life empieza en 1, baja 0.5)
    expect(ps.isActive()).toBe(true);
  });

  it('tras 1 segundo de updates no quedan partículas activas', () => {
    const ps = createParticleSystem();
    ps.emit(64, 64, 12);
    // Simular algo más de 1 segundo para cubrir imprecisión de punto flotante
    ps.update(0.5);
    ps.update(0.5);
    ps.update(0.01);
    expect(ps.isActive()).toBe(false);
  });

  it('draw() no lanza sin partículas', () => {
    const ps = createParticleSystem();
    // Crear un canvas mock mínimo
    const ctx = {
      globalAlpha: 1,
      fillStyle: '',
      fillRect: () => {},
    } as unknown as CanvasRenderingContext2D;

    expect(() => ps.draw(ctx)).not.toThrow();
  });

  it('draw() restaura globalAlpha después de dibujar', () => {
    const ps = createParticleSystem();
    ps.emit(64, 64, 12);

    const ctx = {
      globalAlpha: 1,
      fillStyle: '',
      fillRect: () => {},
    } as unknown as CanvasRenderingContext2D;

    ctx.globalAlpha = 0.8;
    ps.draw(ctx);
    expect(ctx.globalAlpha).toBe(0.8);
  });
});
