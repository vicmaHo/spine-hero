import type { GameEvent } from '../contracts/game';
import { ADSR, MASTER_VOLUME, LOWPASS_HZ, LOWPASS_Q } from './constants';

// Frecuencias de notas (Hz). Una octava por debajo de la versión inicial:
// el registro agudo con onda cuadrada resultaba molesto en sesiones largas.
const NOTE = {
  D3: 146.83, G3: 196.00, A3: 220.00,
  C4: 261.63, E4: 329.63, G4: 392.00,
  C5: 523.25, E5: 659.26,
} as const;

// Definiciones de los 4 sonidos
const SOUNDS: Record<string, { notes: number[]; noteMs: number; sustain?: number }> = {
  LEVEL_UP:       { notes: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5], noteMs: 110 },
  HP_LOST:        { notes: [NOTE.A3, NOTE.D3], noteMs: 220 },
  FLOW_MILESTONE: { notes: [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5, NOTE.E5], noteMs: 95 },
  ACHIEVEMENT:    { notes: [NOTE.G3, NOTE.C4, NOTE.E4, NOTE.G4], noteMs: 150, sustain: 0.5 },
};

// Estado interno del módulo
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let lowpass: BiquadFilterNode | null = null;
let muted = false;

/**
 * Registra un listener de un solo uso para crear el AudioContext
 * en el primer gesto del usuario (autoplay policy).
 */
export function initAudio(): void {
  // Si ya hay contexto, no registres otro par de listeners (evita duplicados
  // cuando varios componentes llaman a initAudio).
  if (ctx) return;

  const handler = (): void => {
    if (!ctx) {
      ctx = new AudioContext();

      // Cadena: ...notas → lowpass → masterGain → destination
      lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = LOWPASS_HZ;
      lowpass.Q.value = LOWPASS_Q;

      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : MASTER_VOLUME;

      lowpass.connect(masterGain);
      masterGain.connect(ctx.destination);
    }
    // Chrome puede crear el contexto en estado 'suspended' incluso tras el
    // gesto; sin este resume() no sale audio nunca.
    if (ctx.state === 'suspended') void ctx.resume();

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
  if (!ctx || !lowpass) return;

  const osc = ctx.createOscillator();
  const env = ctx.createGain();

  osc.type = 'square';
  osc.frequency.value = frequency;

  // Envolvente ADSR con las fases escaladas a la duración real de la nota.
  // Con notas de 60-80 ms los valores fijos de ADSR se solapaban y el
  // sustainEnd caía antes de t0, dejando la nota en silencio.
  const t0 = startTime;
  const attack = Math.min(ADSR.attack, durationSec * 0.15);
  const decay = Math.min(ADSR.decay, durationSec * 0.2);
  const release = Math.min(ADSR.release, durationSec * 0.35);

  const attackEnd = t0 + attack;
  const decayEnd = attackEnd + decay;
  const releaseEnd = t0 + durationSec;
  const sustainEnd = Math.max(decayEnd, releaseEnd - release);

  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(1, attackEnd);
  env.gain.linearRampToValueAtTime(sustain, decayEnd);
  env.gain.setValueAtTime(sustain, sustainEnd);
  env.gain.linearRampToValueAtTime(0, releaseEnd);

  // Conexión: osc → env → lowpass (→ masterGain → destination)
  osc.connect(env);
  env.connect(lowpass);

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

  // El contexto puede quedarse suspendido al volver de otra pestaña
  if (ctx.state === 'suspended') void ctx.resume();

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
