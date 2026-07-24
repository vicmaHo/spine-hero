import { useEffect, useRef } from 'react';
import { createRenderer } from '../feedback/renderer';
import { useAppStore } from '../store/useAppStore';

/**
 * Monta el renderer pixel-art de M sobre un canvas.
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
    renderer.start();

    // Efecto de partículas al recuperar la postura (BAD → GOOD).
    let prevStatus = useAppStore.getState().frame?.status;
    const unsub = useAppStore.subscribe((s) => {
      const status = s.frame?.status;
      if (prevStatus === 'BAD' && status === 'GOOD') renderer.triggerParticles();
      prevStatus = status;
    });

    return () => {
      unsub();
      renderer.stop();
    };
  }, []);

  return (
    <div className="w-full h-full min-h-[256px] bg-gray-800 rounded-lg flex items-center justify-center p-4">
      {/* El renderer fija la resolución interna a 128×160; aquí se escala ×2 con pixelado */}
      <canvas
        ref={canvasRef}
        className="[image-rendering:pixelated]"
        style={{ width: 256, height: 320 }}
      />
    </div>
  );
}
