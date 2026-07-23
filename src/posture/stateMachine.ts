import type { PostureStatus } from '../contracts/posture';

// Umbrales de transición (histéresis)
export const THRESHOLD_BAD_ENTER = 60;     // score < 60 → pendiente BAD
export const THRESHOLD_GOOD_ENTER = 75;    // score > 75 → pendiente GOOD
export const MIN_CONFIDENCE = 0.7;

// Duraciones de debounce (ms)
export const DEBOUNCE_BAD_MS = 8000;       // 8 s continuo para GOOD→BAD
export const DEBOUNCE_GOOD_MS = 3000;      // 3 s continuo para BAD→GOOD
export const DEBOUNCE_LOW_CONF_MS = 1000;  // 1 s para entrar en LOW_CONF
export const DEBOUNCE_AWAY_MS = 5000;      // 5 s para entrar en AWAY
export const DEBOUNCE_RECOVER_MS = 2000;   // 2 s para salir de LOW_CONF/AWAY

export interface PostureState {
  status: PostureStatus;
  /** Status estable anterior (GOOD o BAD), para volver tras LOW_CONF/AWAY */
  lastStableStatus: PostureStatus;
  /** Timestamp en que el pending empezó a cumplirse */
  pendingSince: number | null;
  /** Status al que se está tendiendo */
  pendingTarget: PostureStatus | null;
}

export const INITIAL_POSTURE_STATE: PostureState = {
  status: 'GOOD',
  lastStableStatus: 'GOOD',
  pendingSince: null,
  pendingTarget: null,
};

/**
 * Máquina de estados pura con histéresis y debounce temporal.
 * Reglas de prioridad:
 * 1. landmarkCount === 0 → pendiente AWAY
 * 2. confidence < MIN_CONFIDENCE → pendiente LOW_CONF
 * 3. En LOW_CONF/AWAY con señal válida → pendiente recuperación
 * 4. score < THRESHOLD_BAD_ENTER y status GOOD → pendiente BAD
 * 5. score > THRESHOLD_GOOD_ENTER y status BAD → pendiente GOOD
 * 6. Si la condición se rompe → reset pendingSince/pendingTarget
 */
export function transition(
  state: PostureState,
  score: number,
  confidence: number,
  landmarkCount: number,
  now: number,
): PostureState {
  // Regla 1: Sin landmarks → pendiente AWAY
  if (landmarkCount === 0) {
    if (state.pendingTarget === 'AWAY') {
      if (now - state.pendingSince! >= DEBOUNCE_AWAY_MS) {
        return {
          status: 'AWAY',
          lastStableStatus: state.lastStableStatus,
          pendingSince: null,
          pendingTarget: null,
        };
      }
      // Sigue esperando
      return state;
    }
    // Nuevo pending hacia AWAY
    return {
      ...state,
      pendingSince: now,
      pendingTarget: 'AWAY',
    };
  }

  // Regla 2: Confianza baja → pendiente LOW_CONF
  if (confidence < MIN_CONFIDENCE) {
    if (state.pendingTarget === 'LOW_CONF') {
      if (now - state.pendingSince! >= DEBOUNCE_LOW_CONF_MS) {
        return {
          status: 'LOW_CONF',
          lastStableStatus: state.lastStableStatus,
          pendingSince: null,
          pendingTarget: null,
        };
      }
      return state;
    }
    return {
      ...state,
      pendingSince: now,
      pendingTarget: 'LOW_CONF',
    };
  }

  // Regla 3: Recuperación desde LOW_CONF o AWAY (señal válida)
  if (state.status === 'LOW_CONF' || state.status === 'AWAY') {
    // pendingTarget será lastStableStatus durante recuperación
    const recoverTarget = state.lastStableStatus;
    if (state.pendingTarget === recoverTarget) {
      if (now - state.pendingSince! >= DEBOUNCE_RECOVER_MS) {
        return {
          status: recoverTarget,
          lastStableStatus: state.lastStableStatus,
          pendingSince: null,
          pendingTarget: null,
        };
      }
      return state;
    }
    return {
      ...state,
      pendingSince: now,
      pendingTarget: recoverTarget,
    };
  }

  // Regla 4: score bajo y actualmente GOOD → pendiente BAD
  if (score < THRESHOLD_BAD_ENTER && state.status === 'GOOD') {
    if (state.pendingTarget === 'BAD') {
      if (now - state.pendingSince! >= DEBOUNCE_BAD_MS) {
        return {
          status: 'BAD',
          lastStableStatus: 'BAD',
          pendingSince: null,
          pendingTarget: null,
        };
      }
      return state;
    }
    return {
      ...state,
      pendingSince: now,
      pendingTarget: 'BAD',
    };
  }

  // Regla 5: score alto y actualmente BAD → pendiente GOOD
  if (score > THRESHOLD_GOOD_ENTER && state.status === 'BAD') {
    if (state.pendingTarget === 'GOOD') {
      if (now - state.pendingSince! >= DEBOUNCE_GOOD_MS) {
        return {
          status: 'GOOD',
          lastStableStatus: 'GOOD',
          pendingSince: null,
          pendingTarget: null,
        };
      }
      return state;
    }
    return {
      ...state,
      pendingSince: now,
      pendingTarget: 'GOOD',
    };
  }

  // Regla 6: La condición pendiente se ha roto → reset
  if (state.pendingSince !== null) {
    return {
      ...state,
      pendingSince: null,
      pendingTarget: null,
    };
  }

  // Sin cambios
  return state;
}
