import type { GameState } from '../contracts/game';
import { SPRITE_SIZE, HEARTS_COUNT, HP_PER_HEART, FLOW_MILESTONES } from './constants';

// XP necesario para subir de nivel: level * 100
const XP_PER_LEVEL = (level: number): number => level * 100;

// Colores del HUD
const COLOR_HEART_FULL = '#FF2222';
const COLOR_HEART_HALF = '#FF8888';
const COLOR_HEART_EMPTY = '#444444';
const COLOR_TEXT = '#FFFFFF';
const COLOR_FLOW_FILLED = '#44DD44';
const COLOR_FLOW_EMPTY = '#555555';
const COLOR_XP_BAR = '#FFD700';
const COLOR_XP_BG = '#333333';

/**
 * Dibuja la capa de HUD debajo del sprite:
 * corazones de HP, nivel, barra de Flow y barra de XP.
 */
export function drawHUD(ctx: CanvasRenderingContext2D, state: GameState): void {
  const y0 = SPRITE_SIZE; // inicio vertical del HUD
  const width = SPRITE_SIZE; // mismo ancho que el canvas

  // Fuente pixel-art
  ctx.font = '8px PressStart2P';
  ctx.textBaseline = 'top';

  // --- Corazones de HP (izquierda) ---
  drawHearts(ctx, state.hp, 2, y0 + 4);

  // --- Nivel (centro) ---
  const levelText = `Lv.${state.level}`;
  ctx.fillStyle = COLOR_TEXT;
  ctx.fillText(levelText, 52, y0 + 4);

  // --- Barra de Flow (derecha, con caracteres de bloque) ---
  drawFlowBar(ctx, state.flowSeconds, 96, y0 + 4);

  // --- Barra de XP (debajo del nivel, fina de 2px) ---
  drawXPBar(ctx, state.xp, state.level, 52, y0 + 16, width - 54);
}

/**
 * Dibuja 5 corazones representando HP (cada uno = 20 HP).
 * Lleno si HP cubre el corazón completo, medio si cubre la mitad, vacío si no.
 */
function drawHearts(
  ctx: CanvasRenderingContext2D,
  hp: number,
  x: number,
  y: number,
): void {
  ctx.font = '8px PressStart2P';
  ctx.textBaseline = 'top';

  for (let i = 0; i < HEARTS_COUNT; i++) {
    const heartHpStart = i * HP_PER_HEART;
    const hpInHeart = hp - heartHpStart;

    if (hpInHeart >= HP_PER_HEART) {
      // Corazón lleno
      ctx.fillStyle = COLOR_HEART_FULL;
      ctx.fillText('♥', x + i * 10, y);
    } else if (hpInHeart >= HP_PER_HEART / 2) {
      // Corazón medio
      ctx.fillStyle = COLOR_HEART_HALF;
      ctx.fillText('♥', x + i * 10, y);
    } else {
      // Corazón vacío
      ctx.fillStyle = COLOR_HEART_EMPTY;
      ctx.fillText('♡', x + i * 10, y);
    }
  }
}

/**
 * Dibuja la barra de Flow con caracteres de bloque.
 * Progreso relativo al próximo hito en FLOW_MILESTONES.
 */
function drawFlowBar(
  ctx: CanvasRenderingContext2D,
  flowSeconds: number,
  x: number,
  y: number,
): void {
  // Determinar el próximo hito
  const nextMilestone = FLOW_MILESTONES.find(m => flowSeconds < m) ?? FLOW_MILESTONES[FLOW_MILESTONES.length - 1];
  const prevMilestone = FLOW_MILESTONES[FLOW_MILESTONES.indexOf(nextMilestone) - 1] ?? 0;

  const range = nextMilestone - prevMilestone;
  const progress = range > 0
    ? Math.min((flowSeconds - prevMilestone) / range, 1)
    : 1;

  // 4 caracteres de bloque para representar el progreso
  const totalBlocks = 4;
  const filledBlocks = Math.round(progress * totalBlocks);

  ctx.font = '8px PressStart2P';
  ctx.textBaseline = 'top';

  // Bloques llenos
  ctx.fillStyle = COLOR_FLOW_FILLED;
  const filledStr = '▓'.repeat(filledBlocks);
  ctx.fillText(filledStr, x, y);

  // Bloques vacíos
  ctx.fillStyle = COLOR_FLOW_EMPTY;
  const emptyStr = '░'.repeat(totalBlocks - filledBlocks);
  // Calcular offset: cada carácter a 8px con esta fuente monoespaciada
  const offsetX = filledBlocks * 8;
  ctx.fillText(emptyStr, x + offsetX, y);
}

/**
 * Dibuja una barra fina de XP (2px de alto) mostrando progreso al siguiente nivel.
 */
function drawXPBar(
  ctx: CanvasRenderingContext2D,
  xp: number,
  level: number,
  x: number,
  y: number,
  maxWidth: number,
): void {
  const xpForLevel = XP_PER_LEVEL(level);
  const progress = xpForLevel > 0 ? (xp % xpForLevel) / xpForLevel : 0;
  const barWidth = Math.max(maxWidth, 40);
  const barHeight = 2;

  // Fondo de la barra
  ctx.fillStyle = COLOR_XP_BG;
  ctx.fillRect(x, y, barWidth, barHeight);

  // Progreso
  ctx.fillStyle = COLOR_XP_BAR;
  ctx.fillRect(x, y, barWidth * progress, barHeight);
}
