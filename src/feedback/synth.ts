import type { GameEvent } from '../contracts/game';
import { ADSR, MASTER_VOLUME } from './constants';

// Frecuencias de notas (Hz)
const NOTE = {
  C4: 261.63, D4: 293.66, E4: 329.63, G4: 392.00, A4: 440.00,
  C5: 523.25, E5: 659.26, G5: 783.99,
  C6: 1046.50, E6: 1318.51,
} as const;

// Definiciones de los 4 sonidos
const SOUNDS: Record<string, { notes: number[]; noteMs: number; sustain?: number }> = {
  LEVEL_UP:       { notes: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], noteMs: 80 },
  HP_LOST:        { notes: [NOTE.A4, NOTE.D4], noteMs: 200 },
  FLOW_MILESTONE: { notes: [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6], noteMs: 60 },
  ACHIEVEMENT:    { notes: [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5], noteMs: 120, sustain: 0.6 },
};

// Estado interno del módulo
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

/**
 * Registra un listener de un solo uso para crear el AudioContext
 * en el primer gesto del usuario (autoplay policy).
 */
export function initAudio(): void {
  const handler = (): void => {
    if (!ctx) {
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
      masterGain.connect(ctx.destination);
    }
    // Listener de un solo uso: se elimina tras crear el contexto
    document.removeEventListener('click', handler);
    document.removeEventListener('keydown', handler);
  };

  document.addEventListener('click', handler);
  document.addEventListener('keydown', handler);
}

/**
 * Reproduce una nota con envolvente ADSR.
 * Arquitectura: OscillatorNode (square) → GainNode (ADSR) → masterGain → destination
 */
function playNote(frequency: number, startTime: number, durationSec: number, sustain: number): void {
  if (!ctx || !masterGain) return;

  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'square';
  osc.frequency.value = frequency;

  // Envolvente ADSR
  const t0 = startTime;
  const attackEnd = t0 + ADSR.attack;
  const decayEnd = attackEnd + ADSR.decay;
  const sustainEnd = t0 + durationSec - ADSR.release;
  const releaseEnd = t0 + durationSec;

  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(1, attackEnd);
  env.gain.linearRampToValueAtTime(sustain, decayEnd);
  env.gain.setValueAtTime(sustain, sustainEnd);
  env.gain.linearRampToValueAtTime(0, releaseEnd);

  // Conexión: osc → env → masterGain
  osc.connect(env);
  env.connect(masterGain);

  osc.start(t0);
  osc.stop(releaseEnd);
}

/**
 * Reproduce el sonido asociado al tipo de evento.
 * No-op si el AudioContext no se ha creado o si el evento no tiene sonido.
 */
export function playSound(eventType: GameEvent['type']): void {
  if (!ctx || !masterGain) return;

  const sound = SOUNDS[eventType];
  if (!sound) return;

  const now = ctx.currentTime;
  const noteDuration = sound.noteMs / 1000;
  const sustain = sound.sustain ?? ADSR.sustain;

  for (let i = 0; i < sound.notes.length; i++) {
    playNote(sound.notes[i], now + i * noteDuration, noteDuration, sustain);
  }
}

/**
 * Silencia o restaura el volumen maestro.
 */
export function setMuted(value: boolean): void {
  muted = value;
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
  }
}

/**
 * Devuelve el estado actual de mute.
 */
export function isMuted(): boolean {
  return muted;
}
