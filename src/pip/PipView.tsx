import { useEffect, useRef } from 'react';
import type { GameState } from '../contracts/game';
import type { PostureFrame } from '../contracts/posture';
import { createRenderer } from '../feedback/renderer';

export interface PipViewProps {
  gameState: GameState;
  lastFrame: PostureFrame | null;
}

/**
 * Vista mínima para la ventana flotante PiP.
 * Renderiza el avatar (sprite + HUD) en un canvas usando createRenderer.
 * Recibe el estado por props — no abre su propia suscripción al store.
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

    return () => {
      renderer.stop();
    };
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a2e',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          width: '256px',
          height: '320px',
        }}
      />
    </div>
  );
}
