import { PARTICLE_COUNT, PARTICLE_GRAVITY, PARTICLE_LIFETIME } from './constants';

// Paleta pixel-art para las partículas de recuperación
const PARTICLE_COLORS = ['#FFD700', '#44DD44', '#FFFFFF'];

/** Partícula individual del efecto de recuperación de postura. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;    // 0-1, decrece con el tiempo
  color: string;
  size: number;
}

/**
 * Crea un sistema de partículas ligero para el efecto visual
 * cuando el usuario corrige su postura (transición BAD→GOOD).
 */
export function createParticleSystem(): {
  emit: (cx: number, cy: number, count: number) => void;
  update: (dt: number) => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  isActive: () => boolean;
} {
  let particles: Particle[] = [];

  /**
   * Genera `count` partículas en (cx, cy) con velocidades
   * aleatorias en abanico hacia arriba.
   */
  function emit(cx: number, cy: number, count: number): void {
    const n = Math.max(count, 8);
    for (let i = 0; i < n; i++) {
      // Ángulo en abanico hacia arriba: entre -120° y -60° (π medido desde eje +X)
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 1.5);
      const speed = 60 + Math.random() * 100; // px/s

      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        size: 2 + Math.random() * 2, // 2-4 px
      });
    }
  }

  /**
   * Actualiza posición, gravedad y vida de cada partícula.
   * Las partículas muertas (life ≤ 0) se eliminan.
   */
  function update(dt: number): void {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt / PARTICLE_LIFETIME;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += PARTICLE_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /**
   * Dibuja cada partícula viva como un rect con opacidad
   * proporcional a su vida restante.
   */
  function draw(ctx: CanvasRenderingContext2D): void {
    const prevAlpha = ctx.globalAlpha;
    for (const p of particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = prevAlpha;
  }

  /** Devuelve true si hay al menos una partícula viva. */
  function isActive(): boolean {
    return particles.length > 0;
  }

  return { emit, update, draw, isActive };
}

// Re-exportar la constante para uso externo (e.g., renderer)
export { PARTICLE_COUNT };
