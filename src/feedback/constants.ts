import type { PetMood } from '../contracts/game';

// Sprite
export const SPRITE_SIZE = 128;
export const SPRITE_SCALE = 1;        // sin escalado, el frame ya es 128×128
export const FRAME_TOGGLE_MS = 500;

// Tinte
export const MOOD_TINT: Record<PetMood, { color: string; alpha: number }> = {
  idle:  { color: '',        alpha: 0 },
  happy: { color: '#FFD700', alpha: 0.15 },
  sad:   { color: '#4488CC', alpha: 0.2 },
  faint: { color: '#888888', alpha: 0.35 },
};

/**
 * Tinte de ausencia, gris apagado.
 *
 * No es un `PetMood` porque `AWAY` es un `PostureStatus`, y el motor congela
 * el mood mientras el usuario no está (no se le penaliza por levantarse). Sin
 * esto la mascota se quedaba con la cara que tuviera al irse, dando a entender
 * que sigue midiendo. Lo aplica el renderer a partir del último frame.
 */
export const AWAY_TINT = { color: '#9A9A9A', alpha: 0.55 };

// HUD
// 48px = 3 filas: corazones/nivel/Flow, barra de XP y puntaje de postura.
export const HUD_HEIGHT = 48;
export const HEARTS_COUNT = 5;
export const HP_PER_HEART = 20;

// Puntaje de postura en el HUD
export const SCORE_SEGMENTS = 10;
export const SCORE_SEG_WIDTH = 7;
export const SCORE_SEG_GAP = 1;
export const SCORE_SEG_HEIGHT = 7;

// Audio
// Attack algo más largo que un click seco para evitar el chasquido inicial.
export const ADSR = { attack: 0.02, decay: 0.06, sustain: 0.35, release: 0.12 };
export const MASTER_VOLUME = 0.28;
// Filtro paso bajo: recorta los armónicos altos de la onda cuadrada, que son
// los que hacen que suene estridente. Mantiene el carácter 8-bit.
export const LOWPASS_HZ = 1200;
export const LOWPASS_Q = 0.7;

// Partículas
export const PARTICLE_COUNT = 12;
export const PARTICLE_LIFETIME = 1.0; // segundos
export const PARTICLE_GRAVITY = 120;  // px/s²

// Notificaciones y barra de Flow del HUD
export const FLOW_MILESTONES = [5 * 60, 15 * 60, 30 * 60, 60 * 60]; // en segundos
export const FLOW_NOTIFY_AHEAD = 120; // segundos antes del hito
