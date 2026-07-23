import type { PetMood } from '../contracts/game';
import { SPRITE_SIZE } from './constants';

// Mapeo de mood a par de frames en el sprite sheet (índices base)
export const MOOD_FRAME_MAP: Record<PetMood, [number, number]> = {
  idle:  [0, 1],
  happy: [2, 3],
  sad:   [4, 5],
  faint: [6, 7],
};

/**
 * Carga el sprite sheet desde /sprites/hero.png.
 * Resuelve cuando la imagen está lista para dibujar.
 */
export function loadSpriteSheet(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = '/sprites/hero.png';
    img.onload = () => resolve(img);
    img.onerror = (_e) => reject(new Error('No se pudo cargar el sprite sheet'));
  });
}

/**
 * Dibuja un frame del sprite sheet en el canvas a 128×128, sin escalado.
 * Desactiva el suavizado para mantener el estilo pixel-art.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  frameIndex: number,
  x: number,
  y: number,
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet,
    frameIndex * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE, // source rect
    x, y, SPRITE_SIZE, SPRITE_SIZE,                        // dest rect (1:1)
  );
}
