import type { PostureStatus } from '../contracts/posture';

// --- StatusIndicator ---

interface StatusIndicatorProps {
  status: PostureStatus | null;
}

const STATUS_COLORS: Record<PostureStatus, string> = {
  GOOD: 'bg-green-500',
  BAD: 'bg-red-500',
  AWAY: 'bg-gray-500',
  CALIBRATING: 'bg-amber-500',
  LOW_CONF: 'bg-purple-500',
};

const STATUS_LABELS: Record<PostureStatus, string> = {
  GOOD: 'Buena',
  BAD: 'Mala',
  AWAY: 'Ausente',
  CALIBRATING: 'Calibrando',
  LOW_CONF: 'Baja Confianza',
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const effective: PostureStatus = status ?? 'CALIBRATING';
  const color = STATUS_COLORS[effective];
  const label = STATUS_LABELS[effective];

  return (
    <div className="flex items-center gap-3">
      <span
        data-testid="status-indicator"
        className={`${color} w-4 h-4 rounded-full inline-block`}
      />
      <span className="text-sm font-medium text-white">{label}</span>
    </div>
  );
}

// --- ScoreBar ---

/**
 * Umbral de score por debajo del cual la barra deja de ser verde y transiciona
 * hacia rojo. Por encima: verde pleno. Por debajo: gradiente verde→amarillo→rojo,
 * más rojo cuanto peor la postura.
 */
export const SCORE_TRANSITION_START = 30;

/**
 * Color de la barra de score en función de la postura.
 * Interpola el tono HSL de 120 (verde) en el umbral a 0 (rojo) en score 0.
 */
export function scoreBarColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  const ratio = clamped >= SCORE_TRANSITION_START ? 1 : clamped / SCORE_TRANSITION_START;
  const hue = Math.round(120 * ratio);
  return `hsl(${hue}, 70%, 45%)`;
}

interface ScoreBarProps {
  score: number | null;
}

export function ScoreBar({ score }: ScoreBarProps) {
  const value = score ?? 0;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-white w-8 text-right">
        {clamped}
      </span>
      <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          data-testid="score-bar-fill"
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${clamped}%`, backgroundColor: scoreBarColor(clamped) }}
        />
      </div>
    </div>
  );
}
