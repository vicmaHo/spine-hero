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

// HUD
export const HUD_HEIGHT = 32;
export const HEARTS_COUNT = 5;
export const HP_PER_HEART = 20;

// Audio
export const ADSR = { attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.1 };
export const MASTER_VOLUME = 0.4;

// Partículas
export const PARTICLE_COUNT = 12;
export const PARTICLE_LIFETIME = 1.0; // segundos
export const PARTICLE_GRAVITY = 120;  // px/s²

// Notificaciones
export const FLOW_MILESTONES = [5 * 60, 15 * 60, 30 * 60, 60 * 60]; // en segundos
export const FLOW_NOTIFY_AHEAD = 120; // segundos antes del hito
