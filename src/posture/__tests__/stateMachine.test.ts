import { describe, it, expect } from 'vitest';
import {
  transition,
  INITIAL_POSTURE_STATE,
  DEBOUNCE_BAD_MS,
  DEBOUNCE_GOOD_MS,
  DEBOUNCE_LOW_CONF_MS,
  DEBOUNCE_AWAY_MS,
  DEBOUNCE_RECOVER_MS,
  type PostureState,
} from '../stateMachine';

// Helpers para llamar transition con valores por defecto razonables
const VALID_CONFIDENCE = 0.9;
const VALID_LANDMARKS = 5;

describe('stateMachine · transition', () => {
  describe('GOOD → BAD (8 s debounce)', () => {
    it('transiciona a BAD cuando score < 60 persiste 8 s', () => {
      const t0 = 1000;
      // Primer frame con score bajo: inicia pending
      const s1 = transition(INITIAL_POSTURE_STATE, 50, VALID_CONFIDENCE, VALID_LANDMARKS, t0);
      expect(s1.status).toBe('GOOD');
      expect(s1.pendingTarget).toBe('BAD');
      expect(s1.pendingSince).toBe(t0);

      // Frame justo antes de los 8 s: sigue en GOOD
      const s2 = transition(s1, 50, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + DEBOUNCE_BAD_MS - 1);
      expect(s2.status).toBe('GOOD');

      // Frame al cumplir los 8 s: transiciona a BAD
      const s3 = transition(s1, 50, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + DEBOUNCE_BAD_MS);
      expect(s3.status).toBe('BAD');
      expect(s3.lastStableStatus).toBe('BAD');
      expect(s3.pendingSince).toBeNull();
      expect(s3.pendingTarget).toBeNull();
    });

    it('NO transiciona si el score sube antes de 8 s', () => {
      const t0 = 1000;
      const s1 = transition(INITIAL_POSTURE_STATE, 50, VALID_CONFIDENCE, VALID_LANDMARKS, t0);
      expect(s1.pendingTarget).toBe('BAD');

      // Score sube por encima del umbral (ya no cumple condición de BAD)
      const s2 = transition(s1, 80, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + 4000);
      expect(s2.status).toBe('GOOD');
      expect(s2.pendingSince).toBeNull();
      expect(s2.pendingTarget).toBeNull();
    });
  });

  describe('BAD → GOOD (3 s debounce)', () => {
    it('transiciona a GOOD cuando score > 75 persiste 3 s', () => {
      const badState: PostureState = {
        status: 'BAD',
        lastStableStatus: 'BAD',
        pendingSince: null,
        pendingTarget: null,
      };
      const t0 = 5000;

      // Score alto: inicia pending GOOD
      const s1 = transition(badState, 80, VALID_CONFIDENCE, VALID_LANDMARKS, t0);
      expect(s1.status).toBe('BAD');
      expect(s1.pendingTarget).toBe('GOOD');
      expect(s1.pendingSince).toBe(t0);

      // Justo antes de 3 s
      const s2 = transition(s1, 80, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + DEBOUNCE_GOOD_MS - 1);
      expect(s2.status).toBe('BAD');

      // Al cumplir 3 s
      const s3 = transition(s1, 80, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + DEBOUNCE_GOOD_MS);
      expect(s3.status).toBe('GOOD');
      expect(s3.lastStableStatus).toBe('GOOD');
    });
  });

  describe('→ LOW_CONF (1 s debounce)', () => {
    it('transiciona a LOW_CONF cuando confidence < 0.7 persiste 1 s', () => {
      const t0 = 2000;

      // Confidence baja: inicia pending
      const s1 = transition(INITIAL_POSTURE_STATE, 90, 0.5, VALID_LANDMARKS, t0);
      expect(s1.status).toBe('GOOD');
      expect(s1.pendingTarget).toBe('LOW_CONF');

      // Al cumplir 1 s
      const s2 = transition(s1, 90, 0.5, VALID_LANDMARKS, t0 + DEBOUNCE_LOW_CONF_MS);
      expect(s2.status).toBe('LOW_CONF');
      expect(s2.lastStableStatus).toBe('GOOD');
    });
  });

  describe('→ AWAY (5 s debounce)', () => {
    it('transiciona a AWAY cuando landmarkCount es 0 por 5 s', () => {
      const t0 = 3000;

      // Sin landmarks: inicia pending AWAY
      const s1 = transition(INITIAL_POSTURE_STATE, 90, VALID_CONFIDENCE, 0, t0);
      expect(s1.status).toBe('GOOD');
      expect(s1.pendingTarget).toBe('AWAY');

      // Justo antes de 5 s
      const s2 = transition(s1, 90, VALID_CONFIDENCE, 0, t0 + DEBOUNCE_AWAY_MS - 1);
      expect(s2.status).toBe('GOOD');

      // Al cumplir 5 s
      const s3 = transition(s1, 90, VALID_CONFIDENCE, 0, t0 + DEBOUNCE_AWAY_MS);
      expect(s3.status).toBe('AWAY');
      expect(s3.lastStableStatus).toBe('GOOD');
    });
  });

  describe('Recuperación (2 s debounce)', () => {
    it('recupera desde LOW_CONF a lastStableStatus tras 2 s de señal válida', () => {
      const lowConfState: PostureState = {
        status: 'LOW_CONF',
        lastStableStatus: 'GOOD',
        pendingSince: null,
        pendingTarget: null,
      };
      const t0 = 10000;

      // Señal válida: inicia pending de recuperación
      const s1 = transition(lowConfState, 90, VALID_CONFIDENCE, VALID_LANDMARKS, t0);
      expect(s1.status).toBe('LOW_CONF');
      expect(s1.pendingTarget).toBe('GOOD');

      // Al cumplir 2 s
      const s2 = transition(s1, 90, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + DEBOUNCE_RECOVER_MS);
      expect(s2.status).toBe('GOOD');
    });

    it('recupera desde AWAY a lastStableStatus (BAD) tras 2 s', () => {
      const awayState: PostureState = {
        status: 'AWAY',
        lastStableStatus: 'BAD',
        pendingSince: null,
        pendingTarget: null,
      };
      const t0 = 20000;

      const s1 = transition(awayState, 50, VALID_CONFIDENCE, VALID_LANDMARKS, t0);
      expect(s1.pendingTarget).toBe('BAD');

      const s2 = transition(s1, 50, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + DEBOUNCE_RECOVER_MS);
      expect(s2.status).toBe('BAD');
      expect(s2.lastStableStatus).toBe('BAD');
    });
  });

  describe('Reinicio de contadores', () => {
    it('resetea pendingSince cuando la condición se rompe antes del debounce', () => {
      const t0 = 1000;

      // Inicia pending BAD
      const s1 = transition(INITIAL_POSTURE_STATE, 50, VALID_CONFIDENCE, VALID_LANDMARKS, t0);
      expect(s1.pendingTarget).toBe('BAD');
      expect(s1.pendingSince).toBe(t0);

      // Score vuelve a rango neutro (no cumple condición de BAD ni de GOOD)
      const s2 = transition(s1, 65, VALID_CONFIDENCE, VALID_LANDMARKS, t0 + 2000);
      expect(s2.pendingSince).toBeNull();
      expect(s2.pendingTarget).toBeNull();
      expect(s2.status).toBe('GOOD');
    });

    it('resetea pending de recuperación si la señal se pierde de nuevo', () => {
      const lowConfState: PostureState = {
        status: 'LOW_CONF',
        lastStableStatus: 'GOOD',
        pendingSince: null,
        pendingTarget: null,
      };
      const t0 = 5000;

      // Inicia recuperación
      const s1 = transition(lowConfState, 90, VALID_CONFIDENCE, VALID_LANDMARKS, t0);
      expect(s1.pendingTarget).toBe('GOOD');

      // Confidence cae de nuevo antes de completar recuperación
      const s2 = transition(s1, 90, 0.5, VALID_LANDMARKS, t0 + 1000);
      expect(s2.pendingTarget).toBe('LOW_CONF');
      expect(s2.pendingSince).toBe(t0 + 1000);
    });
  });

  describe('Inmutabilidad', () => {
    it('no muta el estado original', () => {
      const original: PostureState = {
        status: 'GOOD',
        lastStableStatus: 'GOOD',
        pendingSince: null,
        pendingTarget: null,
      };
      const frozen = Object.freeze({ ...original });

      // No debería lanzar error porque transition no muta
      const result = transition(frozen, 50, VALID_CONFIDENCE, VALID_LANDMARKS, 1000);

      // El resultado es un objeto nuevo
      expect(result).not.toBe(frozen);
      // El original sigue intacto
      expect(frozen.status).toBe('GOOD');
      expect(frozen.pendingSince).toBeNull();
      expect(frozen.pendingTarget).toBeNull();
    });
  });
});
