import { useEffect, useState } from 'react';
import logo from '../assets/logo.png';
import backgroundDashboard from '../assets/background-dashboard.png';

/**
 * Mensajes de arranque. Se muestran en orden según avanza la barra.
 * Ojo: la cámara y el modelo de MediaPipe NO se cargan aquí, solo al pulsar
 * Iniciar. Lo que esta pantalla espera de verdad son los assets estáticos
 * (logo, fondo, sprite del compañero) y la fuente pixel.
 */
const LOADING_MESSAGES = [
  'Inicializando cámara…',
  'Cargando compañero…',
  'Preparando detección de postura…',
  'Sincronizando recursos…',
  'Entrando al mundo…',
];

/** Segmentos de la barra pixelada. */
const BAR_SEGMENTS = 24;

/**
 * Tiempo mínimo en pantalla. Sumado a FADE_MS da 2,5 s de arranque en total.
 * No da tiempo a mostrar los cinco mensajes: es intencionado, la barra manda.
 */
const MIN_DURATION_MS = 2100;

/** Duración del fundido de salida. */
const FADE_MS = 400;

/** Tope del progreso simulado antes de que los assets confirmen. */
const PROGRESS_CEILING = 92;

interface SplashScreenProps {
  /** Se invoca cuando el fundido de salida ha terminado. */
  onFinish: () => void;
}

/**
 * Precarga una imagen. Nunca rechaza: un asset que falle no debe
 * dejar al usuario encerrado en la pantalla de carga.
 */
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();

    // Progreso simulado: sube suave hasta el tope y ahí espera a los assets.
    // El paso está calibrado para alcanzar el tope antes de MIN_DURATION_MS;
    // si no, la barra se quedaría a medias al retirarse la pantalla.
    const interval = setInterval(() => {
      setProgress((p) => (p >= PROGRESS_CEILING ? p : Math.min(PROGRESS_CEILING, p + 3)));
    }, 45);

    const assetsReady = Promise.all([
      preloadImage(logo),
      preloadImage(backgroundDashboard),
      preloadImage('/sprites/hero.png'),
      document.fonts.ready,
    ]);

    void assetsReady.then(async () => {
      // Respetar el mínimo en pantalla aunque los assets ya estén en caché.
      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, MIN_DURATION_MS - elapsed);
      await new Promise((r) => setTimeout(r, remaining));
      if (cancelled) return;

      setProgress(100);
      setFading(true);
      await new Promise((r) => setTimeout(r, FADE_MS));
      if (cancelled) return;
      onFinish();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onFinish]);

  const messageIndex = Math.min(
    LOADING_MESSAGES.length - 1,
    Math.floor((progress / 100) * LOADING_MESSAGES.length),
  );
  const filledSegments = Math.round((progress / 100) * BAR_SEGMENTS);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden transition-opacity"
      style={{
        opacity: fading ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        pointerEvents: fading ? 'none' : 'auto',
        backgroundColor: 'var(--backdrop-deep)',
      }}
      role="status"
      aria-live="polite"
      aria-label="Cargando SPINE HERO"
    >
      {/* Fondo pixel art */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundDashboard})` }}
        aria-hidden="true"
      />
      {/* Overlay oscuro para la legibilidad */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 100% at 50% 45%, rgba(14,10,6,0.62) 30%, rgba(14,10,6,0.86) 100%)',
        }}
        aria-hidden="true"
      />

      {/* Contenido */}
      <div className="relative flex flex-col items-center gap-7 px-6">

        {/* Logo con halo cálido */}
        <div className="animate-splash-in relative flex items-center justify-center">
          <div
            className="animate-rpg-glow pointer-events-none absolute h-[150%] w-[150%] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(242,207,107,0.30) 0%, transparent 66%)' }}
            aria-hidden="true"
          />
          <img
            src={logo}
            alt="SPINE HERO"
            className="pixelated relative w-[min(78vw,460px)] drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)]"
          />
        </div>

        <div className="animate-splash-in-delayed flex flex-col items-center gap-6">
          {/* Subtítulo */}
          <p className="text-center text-[14px] font-medium tracking-wide text-[#e2c793]">
            Mejora tu postura, mejora tu aventura.
          </p>

          {/* Barra de carga pixelada */}
          <div
            className="rpg-bar-track flex h-[20px] w-[min(80vw,380px)] gap-[2px] p-[3px]"
            style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.75), 0 0 22px -4px rgba(217,169,56,0.55)' }}
          >
            {Array.from({ length: BAR_SEGMENTS }, (_, i) => {
              const on = i < filledSegments;
              return (
                <span
                  key={i}
                  className="rpg-seg"
                  style={{
                    background: on
                      ? 'linear-gradient(180deg, #f2cf6b 0%, #d9a938 55%, #9c7420 100%)'
                      : 'rgba(255,255,255,0.06)',
                    boxShadow: on ? 'inset 0 1px 0 0 rgba(255,255,255,0.5)' : 'none',
                  }}
                />
              );
            })}
          </div>

          {/* Mensaje de carga */}
          <p className="font-pixel min-h-[1.6em] text-center text-[9px] text-[#f2cf6b]">
            {LOADING_MESSAGES[messageIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
