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
      className="w-full h-full min-h-[256px] bg-gray-800 rounded-lg flex items-center justify-center p-4 bg-cover bg-center"
      style={{ backgroundImage: `url(${backgroundHero})` }}
    >
      {/* El renderer fija la resolución interna a 128×160; aquí se escala ×2 con pixelado */}
      <canvas
        ref={canvasRef}
        className="[image-rendering:pixelated]"
        style={{ width: 256, height: 320 }}
      />
    </div>
  );
}
