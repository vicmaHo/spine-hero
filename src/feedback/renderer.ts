import type { GameState } from '../contracts/game';
import type { PostureFrame } from '../contracts/posture';
import { FRAME_TOGGLE_MS, MOOD_TINT, SPRITE_SIZE, PARTICLE_COUNT } from './constants';
import { drawHUD } from './hud';
import { createParticleSystem } from './particles';
import { loadSpriteSheet, drawSprite, MOOD_FRAME_MAP } from './spriteSheet';

// Dimensiones del canvas: sprite 128×128 + HUD 32px abajo
const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 160;

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  getState: () => GameState;
  getLastFrame: () => PostureFrame | null;
}

/**
 * Crea el renderer del canvas con el bucle de animación, tinte por mood
 * y alternancia de frames cada 500 ms.
 * Todo el estado vive dentro del closure; sin singletons.
 */
export function createRenderer(opts: RendererOptions): {
  start: () => void;
  stop: () => void;
  triggerParticles: () => void;
} {
  const { canvas, getState } = opts;
  const ctx = canvas.getContext('2d')!;

  let sheet: HTMLImageElement | null = null;
  let rafId: number | null = null;
  let lastToggleTime = 0;
  let lastFrameTime = 0; // para calcular dt de partículas
  let currentFrameSlot = 0; // 0 o 1 dentro del par de frames del mood

  // Sistema de partículas para el efecto de recuperación de postura
  const particles = createParticleSystem();

  // Configura las dimensiones del canvas
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  /**
   * Carga la fuente Press Start 2P con FontFace API.
   */
  async function loadFont(): Promise<void> {
    const font = new FontFace('PressStart2P', 'url(/fonts/PressStart2P.ttf)');
    await font.load();
    document.fonts.add(font);
  }

  /**
   * Bucle principal de render con requestAnimationFrame.
   */
  function loop(now: number): void {
    rafId = requestAnimationFrame(loop);

    // 1. Limpiar canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (!sheet) return;

    const state = getState();
    const mood = state.mood;

    // 2. Determinar frame de animación (toggle cada 500 ms)
    if (now - lastToggleTime >= FRAME_TOGGLE_MS) {
      currentFrameSlot = currentFrameSlot === 0 ? 1 : 0;
      lastToggleTime = now;
    }

    const framePair = MOOD_FRAME_MAP[mood];
    const frameIndex = framePair[currentFrameSlot];

    // 3. Dibujar sprite base
    drawSprite(ctx, sheet, frameIndex, 0, 0);

    // 4. Aplicar tinte con globalCompositeOperation = 'source-atop'
    const tint = MOOD_TINT[mood];
    if (tint.alpha > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint.color;
      ctx.globalAlpha = tint.alpha;
      ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      ctx.globalAlpha = 1;
    }

    // 5. Restaurar globalCompositeOperation para capas superiores
    ctx.globalCompositeOperation = 'source-over';

    // 6. Dibujar HUD (corazones, nivel, Flow, XP)
    drawHUD(ctx, state);

    // 7. Actualizar y dibujar partículas
    const dt = lastFrameTime > 0 ? (now - lastFrameTime) / 1000 : 0;
    lastFrameTime = now;
    particles.update(dt);
    particles.draw(ctx);
  }

  /**
   * Inicia el renderer: carga assets y arranca el bucle rAF.
   */
  function start(): void {
    // Carga fuente y sprite sheet en paralelo, luego arranca el loop
    Promise.all([loadFont(), loadSpriteSheet()]).then(([, loadedSheet]) => {
      sheet = loadedSheet;
      lastToggleTime = performance.now();
      rafId = requestAnimationFrame(loop);
    });
  }

  /**
   * Detiene el renderer cancelando el rAF pendiente.
   */
  function stop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /**
   * Dispara el efecto de partículas en el centro del sprite.
   * Se invoca al detectar transición BAD→GOOD.
   */
  function triggerParticles(): void {
    particles.emit(64, 64, PARTICLE_COUNT);
  }

  return { start, stop, triggerParticles };
}
