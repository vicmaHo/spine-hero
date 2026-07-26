import { useEffect, useRef } from 'react';
import type { GameState } from '../contracts/game';
import type { PostureFrame, PostureStatus } from '../contracts/posture';
import { createRenderer } from '../feedback/renderer';

export interface PipViewProps {
  gameState: GameState;
  lastFrame: PostureFrame | null;
}

/**
 * Vista de la ventana flotante: solo el avatar, sin marco ni fondo.
 * El audio y las notificaciones los gestiona la ventana principal
 * (AvatarCanvas); aquí solo se renderiza para no duplicar sonidos.
 */
export function PipView({ gameState, lastFrame }: PipViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(gameState);
  const frameRef = useRef(lastFrame);

  // Mantener refs actualizados sin recrear el renderer
  stateRef.current = gameState;
  frameRef.current = lastFrame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createRenderer({
      canvas,
      getState: () => stateRef.current,
      getLastFrame: () => frameRef.current,
    });

    renderer.start();

    // Partículas locales al recuperar la postura en esta ventana
    let prevStatus: PostureStatus | null = frameRef.current?.status ?? null;
    const interval = window.setInterval(() => {
      const status = frameRef.current?.status ?? null;
      if (prevStatus === 'BAD' && status === 'GOOD') renderer.triggerParticles();
      prevStatus = status;
    }, 200);

    return () => {
      window.clearInterval(interval);
      renderer.stop();
    };
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* El canvas mide 128×160 internamente. Si se estira con width y height
          al 100% se deforma en cuanto la ventana cambia de proporción, así que
          se escala manteniendo su relación de aspecto. */}
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          display: 'block',
          height: '100%',
          width: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          aspectRatio: '128 / 160',
        }}
      />
    </div>
  );
}
