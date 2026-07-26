import type { PostureStatus } from '../contracts/posture';

// --- StatusIndicator ---

interface StatusIndicatorProps {
  status: PostureStatus | null;
}

const STATUS_COLORS: Record<PostureStatus, string> = {
  GOOD: 'bg-[#6ea84a]',
  BAD: 'bg-[#c4523c]',
  AWAY: 'bg-[#8a7a63]',
  CALIBRATING: 'bg-[#d9a938]',
  LOW_CONF: 'bg-[#8b5cf6]',
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
    <div className="flex items-center gap-2.5">
      <span
        data-testid="status-indicator"
        className={`${color} inline-block h-3 w-3 rounded-full ring-2 ring-[rgba(36,26,16,0.5)]`}
      />
      <span className="text-[12px] font-semibold text-[#4a3721]">{label}</span>
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
    <div className="flex items-center gap-2.5">
      <span className="font-pixel w-9 text-right text-[9px] text-[#4a3721]">
        {clamped}
      </span>
      <div className="rpg-bar-track h-3 flex-1">
        <div
          data-testid="score-bar-fill"
          className="rpg-bar-fill"
          style={{ width: `${clamped}%`, backgroundColor: scoreBarColor(clamped) }}
        />
      </div>
    </div>
  );
}
