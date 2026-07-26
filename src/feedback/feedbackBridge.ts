import type { GameEvent } from '../contracts/game';
import type { PostureFrame, PostureStatus } from '../contracts/posture';
import { playSound } from './synth';
import { checkAndNotifyFlowMilestone } from './notifications';
import { FLOW_MILESTONES } from './constants';

// Eventos que disparan sonido
const SOUND_EVENTS: Set<GameEvent['type']> = new Set([
  'LEVEL_UP',
  'HP_LOST',
  'FLOW_MILESTONE',
  'ACHIEVEMENT',
]);

// En BAD continuo el motor emite HP_LOST en cada tick. Sin este límite
// el sonido se dispararía 5 veces por segundo.
const HP_LOST_THROTTLE_MS = 4000;

export interface FeedbackBridgeOptions {
  /** Callback para disparar el efecto de partículas (transición BAD→GOOD) */
  onTriggerParticles: () => void;
}

/**
 * Crea el puente entre los eventos del store y la capa de feedback.
 * Escucha GameEvent[] para reproducir sonidos y notificaciones,
 * y detecta la transición BAD→GOOD para disparar partículas.
 */
export function createFeedbackBridge(opts: FeedbackBridgeOptions) {
  let prevStatus: PostureStatus | null = null;
  let notifiedMilestones: Set<number> = new Set();
  let lastHpLostSoundAt = 0;

  /**
   * Se llama cada vez que se procesa un frame y se obtienen eventos del motor.
   */
  function handleEvents(events: GameEvent[], flowSeconds: number): void {
    for (const event of events) {
      if (!SOUND_EVENTS.has(event.type)) continue;

      if (event.type === 'HP_LOST') {
        const now = performance.now();
        if (now - lastHpLostSoundAt < HP_LOST_THROTTLE_MS) continue;
        lastHpLostSoundAt = now;
      }

      playSound(event.type);
    }

    // Notificación de hito inminente
    const nextMilestone = FLOW_MILESTONES.find(m => flowSeconds < m);
    if (nextMilestone !== undefined) {
      const alreadyNotified = notifiedMilestones.has(nextMilestone);
      const sent = checkAndNotifyFlowMilestone(flowSeconds, nextMilestone, alreadyNotified);
      if (sent) {
        notifiedMilestones.add(nextMilestone);
      }
    }
  }

  /**
   * Se llama con cada PostureFrame para detectar transiciones de estado.
   */
  function handleFrame(frame: PostureFrame): void {
    // Detectar transición BAD → GOOD para partículas
    if (prevStatus === 'BAD' && frame.status === 'GOOD') {
      opts.onTriggerParticles();
    }
    prevStatus = frame.status;
  }

  /**
   * Reinicia el estado interno (cuando se reinicia la sesión o flow se rompe).
   */
  function reset(): void {
    prevStatus = null;
    notifiedMilestones = new Set();
  }

  return { handleEvents, handleFrame, reset };
}
