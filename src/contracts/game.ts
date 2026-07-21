export type PetMood = 'idle' | 'happy' | 'sad' | 'faint';

export interface GameState {
  xp: number;
  level: number;
  hp: number;              // 0-100
  flowSeconds: number;     // racha continua actual en GOOD
  goodSecondsToday: number;
  mood: PetMood;
  achievements: string[];
  streakDays: number;
  lastTickAt: number;
}

export type GameEvent =
  | { type: 'XP_GAINED'; amount: number }
  | { type: 'HP_LOST'; amount: number }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'FLOW_MILESTONE'; minutes: number }
  | { type: 'ACHIEVEMENT'; id: string; label: string }
  | { type: 'MOOD_CHANGED'; mood: PetMood }
  | { type: 'FAINTED' }
  | { type: 'REVIVED' };

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

export const INITIAL_GAME_STATE: GameState = {
  xp: 0,
  level: 1,
  hp: 100,
  flowSeconds: 0,
  goodSecondsToday: 0,
  mood: 'idle',
  achievements: [],
  streakDays: 0,
  lastTickAt: 0,
};