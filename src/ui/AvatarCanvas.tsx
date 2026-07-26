import { useEffect, useRef } from 'react';
import { createRenderer } from '../feedback/renderer';
import { createFeedbackBridge } from '../feedback/feedbackBridge';
import { initAudio } from '../feedback/synth';
import { requestNotificationPermission } from '../feedback/notifications';
import { useAppStore } from '../store/useAppStore';
import backgroundHero from '../assets/background-hero.png';

/**
 * Monta el renderer pixel-art de M sobre un canvas.
 * Integra audio 8-bit, notificaciones y partículas.
 * El renderer lee el estado del juego vía callbacks (polling en su bucle rAF),
 * así que no necesita re-renders de React: basta con montarlo una vez.
 */
export function AvatarCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createRenderer({
      canvas,
      getState: () => useAppStore.getState().game,
      getLastFrame: () => useAppStore.getState().frame,
      // El dashboard ya pinta corazones, nivel y EXP en HTML bajo el panel.
      showHud: false,
    });

    const bridge = createFeedbackBridge({
      onTriggerParticles: () => renderer.triggerParticles(),
    });

    // Inicializar audio y notificaciones
    initAudio();
    requestNotificationPermission();

    renderer.start();

    // Suscripción al store. Se dispara en CUALQUIER set (perf, isRunning…),
    // así que comparamos referencias para no procesar dos veces lo mismo.
    let lastFrameRef = useAppStore.getState().frame;
    let lastEventsRef = useAppStore.getState().lastEvents;

    const unsub = useAppStore.subscribe((s) => {
      if (s.frame !== lastFrameRef) {
        lastFrameRef = s.frame;
        if (s.frame) bridge.handleFrame(s.frame);
      }

      if (s.lastEvents !== lastEventsRef) {
        lastEventsRef = s.lastEvents;
        if (s.lastEvents.length > 0) {
          bridge.handleEvents(s.lastEvents, s.game.flowSeconds);
        }
      }
    });

    return () => {
      unsub();
      renderer.stop();
    };
  }, []);

  return (
    <div
      className="relative flex min-h-[340px] w-full flex-1 items-center justify-center bg-cover bg-center p-4"
      style={{ backgroundImage: `url(${backgroundHero})` }}
    >
      {/* Viñeta: oscurece los bordes para que el personaje destaque en el centro */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(20,16,12,0.55) 100%)' }}
        aria-hidden="true"
      />
      {/* Sombra de contacto bajo el personaje */}
      <div
        className="pointer-events-none absolute bottom-[16%] left-1/2 h-3 w-32 -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 72%)' }}
        aria-hidden="true"
      />
      {/* Sin HUD la resolución interna es 128×128; aquí se escala ×2 con pixelado */}
      <canvas
        ref={canvasRef}
        className="pixelated relative drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]"
        style={{ width: 256, height: 256 }}
      />
    </div>
  );
}
