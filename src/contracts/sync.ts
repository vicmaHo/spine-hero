/** Lo ÚNICO que sale del navegador. Solo enteros agregados. */
export interface Checkpoint {
  date: string;               // YYYY-MM-DD
  goodPostureSeconds: number;
  longestFlowStreak: number;  // minutos
  avgScore: number;           // 0-100
  level: number;
  xp: number;
  teamCode?: string;
}

export interface TeamEntry {
  displayName: string;
  goodPostureSeconds: number;
  level: number;
  streakDays: number;
}