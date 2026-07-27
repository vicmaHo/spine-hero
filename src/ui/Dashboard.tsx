import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { VideoThumbnail } from './VideoThumbnail';
import { StatusIndicator } from './StatusIndicator';
import { AvatarCanvas } from './AvatarCanvas';
import { BenchmarksPanel } from './BenchmarksPanel';
import { SyncControl } from './SyncControl';
import { TeamCodeInput } from './TeamCodeInput';
import { RankingPanel } from './RankingPanel';
import { GuestNotice } from './GuestNotice';
import { NickSettings } from './NickSettings';
import { PipButton } from '../pip/PipButton';
import { PetNameRibbon } from './PetNameRibbon';
import backgroundDashboard from '../assets/background-dashboard.png';
import logo from '../assets/logo.png';
import type { PostureError } from '../contracts/posture';

const ERROR_LABELS: Record<PostureError['kind'], string> = {
  CAMERA_DENIED: 'Cámara denegada',
  CAMERA_BUSY: 'Cámara ocupada',
  MODEL_LOAD_FAILED: 'Error al cargar modelo',
  NO_GPU: 'GPU no disponible',
};

/** Corazones del HUD: 5 corazones de 20 HP. Solo presentación. */
const HEARTS_COUNT = 5;
const HP_PER_HEART = 20;

/** Segmentos de la barra pixelada de puntaje. */
const SCORE_SEGMENTS = 20;

/**
 * Umbral de XP del nivel siguiente. Réplica del criterio del motor
 * (100·nivel^1.5) para pintar la barra; `ui/` no importa de `game/`.
 */
function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

/** Tramos de calidad derivados del score. Solo presentación. */
const SCORE_TIERS = [
  { min: 80, label: 'Excelente', color: '#8bbf5c', msg: '¡Excelente! Tu compañero está muy feliz con tu postura.' },
  { min: 60, label: 'Buena',     color: '#6ea84a', msg: 'Buena postura. Tu compañero se siente a gusto.' },
  { min: 40, label: 'Regular',   color: '#d9a938', msg: 'Regular. Endereza la espalda y tu compañero lo notará.' },
  { min: 0,  label: 'Mala',      color: '#c4523c', msg: 'Tu compañero se marchita. Yergue la espalda.' },
] as const;

function scoreTier(score: number): (typeof SCORE_TIERS)[number] {
  return SCORE_TIERS.find((t) => score >= t.min) ?? SCORE_TIERS[SCORE_TIERS.length - 1];
}

/* ── Iconografía inline: sin peticiones de red ── */

function IconPlay() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="M14 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <rect x="2.5" y="7" width="12" height="10" rx="2" />
      <path d="M14.5 11.5l6-3.5v8l-6-3.5z" strokeLinejoin="round" />
    </svg>
  );
}

function IconHeart({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5l-1.5-1.35C5.9 15.05 3 12.4 3 9.1 3 6.5 5.05 4.5 7.6 4.5c1.45 0 2.85.68 3.75 1.78l.65.8.65-.8A4.83 4.83 0 0116.4 4.5C18.95 4.5 21 6.5 21 9.1c0 3.3-2.9 5.95-7.5 10.06L12 20.5z"
        fill={filled ? '#e0524a' : 'rgba(255,255,255,0.12)'}
        stroke={filled ? '#8e2820' : 'rgba(0,0,0,0.45)'}
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** Chispas cálidas flotando sobre el fondo. Puramente decorativo. */
interface Spark {
  left: string;
  bottom: string;
  delay: string;
  duration: string;
  size: number;
  color: string;
  /** Deriva lenta en zigzag en vez de ascenso recto. */
  drift?: boolean;
}

/**
 * Distribución manual (no aleatoria) para que el enjambre quede repartido y
 * no cambie en cada render. Mezcla de tamaños, ritmos y tonos cálidos para
 * dar sensación de profundidad.
 */
const SPARKS: Spark[] = [
  { left: '4%',  bottom: '12%', delay: '0s',    duration: '7s',    size: 3, color: '#f2cf6b' },
  { left: '9%',  bottom: '46%', delay: '2.6s',  duration: '12s',   size: 2, color: '#ffb85c', drift: true },
  { left: '14%', bottom: '72%', delay: '5.1s',  duration: '9s',    size: 2, color: '#ffe9a8' },
  { left: '19%', bottom: '26%', delay: '1.3s',  duration: '10.5s', size: 4, color: '#d9a938', drift: true },
  { left: '25%', bottom: '58%', delay: '3.9s',  duration: '8s',    size: 2, color: '#f2cf6b' },
  { left: '31%', bottom: '8%',  delay: '0.6s',  duration: '11s',   size: 3, color: '#ffb85c', drift: true },
  { left: '36%', bottom: '38%', delay: '6.2s',  duration: '7.5s',  size: 2, color: '#a8d47a' },
  { left: '42%', bottom: '66%', delay: '2.1s',  duration: '13s',   size: 3, color: '#ffe9a8', drift: true },
  { left: '47%', bottom: '18%', delay: '4.7s',  duration: '9.5s',  size: 2, color: '#f2cf6b' },
  { left: '53%', bottom: '52%', delay: '1.8s',  duration: '10s',   size: 4, color: '#d9a938', drift: true },
  { left: '58%', bottom: '30%', delay: '5.6s',  duration: '8.5s',  size: 2, color: '#ffb85c' },
  { left: '63%', bottom: '76%', delay: '3.2s',  duration: '12.5s', size: 3, color: '#f2cf6b', drift: true },
  { left: '68%', bottom: '14%', delay: '0.9s',  duration: '7s',    size: 2, color: '#ffe9a8' },
  { left: '74%', bottom: '44%', delay: '4.3s',  duration: '11.5s', size: 3, color: '#a8d47a', drift: true },
  { left: '79%', bottom: '62%', delay: '2.4s',  duration: '9s',    size: 2, color: '#d9a938' },
  { left: '84%', bottom: '22%', delay: '6.8s',  duration: '10.5s', size: 4, color: '#ffb85c', drift: true },
  { left: '89%', bottom: '54%', delay: '1.1s',  duration: '8s',    size: 2, color: '#f2cf6b' },
  { left: '94%', bottom: '34%', delay: '3.5s',  duration: '12s',   size: 3, color: '#ffe9a8', drift: true },
  { left: '97%', bottom: '70%', delay: '5.9s',  duration: '9.5s',  size: 2, color: '#d9a938' },
  { left: '2%',  bottom: '64%', delay: '4.1s',  duration: '11s',   size: 2, color: '#ffb85c', drift: true },
];

interface DashboardProps {
  /** Vuelve a la landing. */
  onBackToLanding: () => void;
}

export function Dashboard({ onBackToLanding }: DashboardProps) {
  const frame = useAppStore((s) => s.frame);
  const isRunning = useAppStore((s) => s.isRunning);
  const source = useAppStore((s) => s.source);
  const lastError = useAppStore((s) => s.lastError);
  const start = useAppStore((s) => s.start);
  const stop = useAppStore((s) => s.stop);
  const calibrate = useAppStore((s) => s.calibrate);
  const setSource = useAppStore((s) => s.setSource);
  const calibration = useAppStore((s) => s.calibration);
  const calibrationError = useAppStore((s) => s.calibrationError);
  const game = useAppStore((s) => s.game);

  const [isCalibrating, setIsCalibrating] = useState(false);

  const score = frame ? Math.round(frame.score) : 0;
  const tier = scoreTier(score);
  const filledSegments = Math.round((score / 100) * SCORE_SEGMENTS);

  const nextLevelXp = xpForLevel(game.level);
  const xpInLevel = nextLevelXp > 0 ? game.xp % nextLevelXp : 0;
  const xpRatio = nextLevelXp > 0 ? Math.min(1, xpInLevel / nextLevelXp) : 0;
  const filledHearts = Math.round(game.hp / HP_PER_HEART);

  const handleStart = async () => { await start(); };
  const handleStop = () => { stop(); };
  const handleCalibrate = async () => {
    setIsCalibrating(true);
    try { await calibrate(); } finally { setIsCalibrating(false); }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 lg:px-8">

      {/* Fondo del mundo: imagen fija y atenuada, los paneles van por encima */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundDashboard})`, opacity: 0.45 }}
        aria-hidden="true"
      />
      {/* Velo: asienta los paneles sobre la imagen sin apagarla */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(18,14,10,0.18) 34%, rgba(18,14,10,0.58) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Chispas ambientales cálidas */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className={`absolute rounded-full ${s.drift ? 'animate-rpg-drift' : 'animate-rpg-float'}`}
            style={{
              left: s.left,
              bottom: s.bottom,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
              animationDuration: s.duration,
              background: s.color,
              boxShadow: `0 0 ${s.size * 3}px ${s.size}px ${s.color}66`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px]">

        {/* Cabecera: logo a la izquierda, salida a la landing a la derecha */}
        <header className="mb-5 flex items-center justify-between gap-4">
          <img
            src={logo}
            alt="SPINE HERO"
            className="pixelated h-11 w-auto drop-shadow-[0_3px_7px_rgba(0,0,0,0.7)]"
          />
          <button
            onClick={onBackToLanding}
            className="rpg-btn rpg-btn-sm shrink-0"
            style={{
              background: 'linear-gradient(180deg, #8a6239 0%, #5c4128 100%)',
              boxShadow:
                'inset 0 2px 0 2px rgba(255,220,170,0.22), inset 0 -2px 0 2px rgba(40,26,12,0.35), 0 4px 0 0 #3b2a1c, 0 8px 16px -5px rgba(0,0,0,0.6)',
            }}
          >
            <IconBack />
            VOLVER AL INICIO
          </button>
        </header>

        <div className="grid grid-cols-12 gap-5 lg:gap-6">

          {/* Aviso de sesión sin nick. Se pinta él mismo a col-span-12 y solo
              existe en la fase 'guest'; en el resto no ocupa nada. */}
          <GuestNotice />

          {/* ═══════════ Columna izquierda: cámara + puntaje ═══════════ */}
          <div className="col-span-12 flex flex-col gap-5 lg:col-span-3 lg:gap-6">

            {/* Cámara */}
            <section className="rpg-panel rpg-hover-lift px-3 pb-3 pt-7">
              <div className="absolute -top-3 left-3">
                <span className="rpg-ribbon">
                  <IconCamera />
                  CÁMARA EN VIVO
                </span>
              </div>
              <div className="rpg-inset relative">
                <VideoThumbnail />
                {isRunning && (
                  <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-md border-2 border-[#241a10] bg-[rgba(20,16,12,0.82)] px-2.5 py-1">
                    <span className="animate-rpg-blink h-2 w-2 rounded-full bg-[#8bbf5c]" />
                    <span className="font-pixel text-[7px] text-[#dff0c8]">EN VIVO</span>
                  </div>
                )}
              </div>
            </section>

            {/* Puntaje de postura */}
            <section className="rpg-panel px-4 pb-4 pt-7">
              <div className="absolute -top-3 left-3">
                <span className="rpg-ribbon">PUNTAJE DE POSTURA</span>
              </div>

              <div className="flex items-end justify-between gap-3">
                <p
                  className="font-pixel text-[34px] leading-none"
                  style={{ color: '#2c5138', textShadow: '0 2px 0 rgba(255,255,255,0.55)' }}
                >
                  {score}%
                </p>
                <span
                  className="font-pixel flex items-center gap-1.5 rounded-md border-2 border-[#241a10] px-2.5 py-1.5 text-[8px] text-white"
                  style={{
                    background: `linear-gradient(180deg, ${tier.color} 0%, rgba(0,0,0,0.28) 220%)`,
                    boxShadow: 'inset 0 2px 0 1px rgba(255,255,255,0.3), 0 3px 0 0 rgba(20,14,8,0.5)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.5)',
                  }}
                >
                  {tier.label.toUpperCase()}
                </span>
              </div>

              {/* Barra pixelada segmentada */}
              <div className="rpg-bar-track mt-3 flex h-[18px] gap-[2px] p-[3px]">
                {Array.from({ length: SCORE_SEGMENTS }, (_, i) => {
                  const on = i < filledSegments;
                  return (
                    <span
                      key={i}
                      className="rpg-seg"
                      style={{
                        backgroundColor: on ? tier.color : 'rgba(255,255,255,0.07)',
                        boxShadow: on ? 'inset 0 1px 0 0 rgba(255,255,255,0.45)' : 'none',
                      }}
                    />
                  );
                })}
              </div>

              {/* Estado del pipeline + mensaje del compañero */}
              <div className="mt-3 flex items-center gap-2 rounded-md border-2 border-[#c9ab74] bg-[rgba(255,255,255,0.34)] px-2.5 py-1.5">
                <StatusIndicator status={frame?.status ?? null} />
              </div>
              <p className="mt-2 rounded-md border-2 border-[#c9ab74] bg-[rgba(255,255,255,0.34)] px-3 py-2 text-[12px] font-medium leading-snug text-[#4a3721]">
                {tier.msg}
              </p>
            </section>
          </div>

          {/* ═══════════ Centro: el compañero (protagonista) ═══════════ */}
          <div className="col-span-12 lg:col-span-6">
            <section className="rpg-panel-hero flex h-full flex-col px-4 pb-4 pt-8">
              <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                <PetNameRibbon />
              </div>

              {/* Halo cálido detrás del personaje */}
              <div
                className="animate-rpg-glow pointer-events-none absolute left-1/2 top-1/2 h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(242,207,107,0.24) 0%, transparent 68%)' }}
                aria-hidden="true"
              />

              {/* Habitación pixel art */}
              <div className="rpg-inset relative flex flex-1 items-center justify-center">
                <AvatarCanvas />
              </div>

              {/* Corazones · nivel · EXP */}
              <div className="rpg-panel-dark mt-4 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: HEARTS_COUNT }, (_, i) => (
                      <span
                        key={i}
                        className={i < filledHearts ? 'animate-rpg-beat' : ''}
                        style={{ animationDelay: `${i * 0.14}s` }}
                      >
                        <IconHeart filled={i < filledHearts} />
                      </span>
                    ))}
                  </div>
                  <p
                    className="font-pixel text-[15px] text-[#f6e9c9]"
                    style={{ textShadow: '0 2px 0 rgba(0,0,0,0.6)' }}
                  >
                    Lv. {game.level}
                  </p>
                </div>

                <div className="mt-2.5 flex items-center gap-2.5">
                  <span className="font-pixel text-[8px] text-[#d9a938]">EXP</span>
                  <div className="rpg-bar-track relative h-[13px] flex-1">
                    <div
                      className="rpg-bar-fill relative overflow-hidden"
                      style={{
                        width: `${xpRatio * 100}%`,
                        background: 'linear-gradient(180deg, #f2cf6b 0%, #d9a938 55%, #9c7420 100%)',
                      }}
                    >
                      <span
                        className="animate-rpg-sheen absolute inset-y-0 w-6"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }}
                      />
                    </div>
                  </div>
                  <span className="font-pixel text-[8px] tabular-nums text-[#e2c793]">
                    {xpInLevel} / {nextLevelXp}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* ═══════════ Columna derecha: controles ═══════════ */}
          <div className="col-span-12 lg:col-span-3">
            <section className="rpg-panel flex h-full flex-col gap-2.5 px-4 pb-4 pt-7">
              <div className="absolute -top-3 left-3">
                <span className="rpg-ribbon">
                  <IconGear />
                  CONTROLES
                </span>
              </div>

              <button onClick={handleStart} disabled={isRunning} className="rpg-btn rpg-btn-green w-full">
                <IconPlay />
                INICIAR
              </button>

              <button onClick={handleStop} disabled={!isRunning} className="rpg-btn rpg-btn-red w-full">
                <IconStop />
                DETENER
              </button>

              <button onClick={handleCalibrate} disabled={isCalibrating} className="rpg-btn rpg-btn-blue w-full">
                <IconTarget />
                {isCalibrating ? 'CALIBRANDO…' : 'CALIBRAR'}
              </button>

              <PipButton />

              {isCalibrating && (
                <p className="animate-pulse text-center text-[11px] font-semibold text-[#2f6a91]">
                  Calibración en progreso…
                </p>
              )}
              {source === 'real' && isRunning && !calibration && !isCalibrating && (
                <p className="rounded-md border-2 border-[#d9a938] bg-[rgba(242,207,107,0.34)] px-2.5 py-2 text-center text-[11px] font-medium leading-snug text-[#6b4c12]">
                  Siéntate erguido y pulsa <strong>Calibrar</strong> (5 s) para empezar.
                </p>
              )}
              {calibrationError && (
                <p className="rounded-md border-2 border-[#c4523c] bg-[rgba(196,82,60,0.18)] px-2.5 py-2 text-[11px] font-medium text-[#8e2820]">
                  {calibrationError}
                </p>
              )}
              {lastError && (
                <p className="rounded-md border-2 border-[#c4523c] bg-[rgba(196,82,60,0.18)] px-2.5 py-2 text-[11px] font-medium text-[#8e2820]">
                  Error: {ERROR_LABELS[lastError.kind]}
                </p>
              )}

              {/* Separador tallado */}
              <div
                className="my-1 h-[3px] w-full rounded-full"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(92,65,40,0.45), transparent)' }}
              />

              {/* Selector de fuente */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="source-select" className="rpg-label">FUENTE</label>
                <select
                  id="source-select"
                  value={source}
                  onChange={(e) => setSource(e.target.value as 'mock' | 'real')}
                  disabled={isRunning}
                  className="rpg-field w-full"
                >
                  <option value="mock">Mock (guion cíclico)</option>
                  <option value="real">Cámara (real)</option>
                </select>
              </div>

              {/* Identidad, código de equipo y sincronización */}
              <div className="mt-auto flex flex-col gap-3 pt-1">
                <NickSettings />
                <TeamCodeInput />
                <SyncControl />
              </div>
            </section>
          </div>

          {/* ═══════════ Ranking de equipos ═══════════ */}
          <div className="col-span-12">
            <RankingPanel />
          </div>

          {/* ═══════════ Rendimiento del pipeline ═══════════ */}
          <div className="col-span-12">
            <BenchmarksPanel />
          </div>
        </div>

        {/* Lema del pie */}
        <div className="mt-7 flex items-center justify-center">
          <span className="rpg-ribbon text-[9px]">
            <span style={{ color: '#f2cf6b' }}>✦</span>
            MEJORA TU POSTURA, MEJORA TU AVENTURA
            <span style={{ color: '#f2cf6b' }}>✦</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
