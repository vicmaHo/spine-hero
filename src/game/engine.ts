// Stub — será reemplazado por el módulo de M
import type { GameState, TickResult } from '../contracts/game';
import type { PostureFrame } from '../contracts/posture';

export function tick(state: GameState, _frame: PostureFrame, _now: number): TickResult {
  return { state, events: [] };
}
