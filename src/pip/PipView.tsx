import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../contracts/game';
import type { PostureFrame, PostureStatus } from '../contracts/posture';
import { createRenderer } from '../feedback/renderer';

export interface PipViewProps {
  gameState: GameState;
  lastFrame: PostureFrame | null;
  /**
   * Lanza la calibración. La inyecta quien monta la ventana: `pip/` no habla
   * con el store, así que la acción llega por prop. Sin ella no se pinta el
   * botón.
   */
  onCalibrate?: () => Promise<void>;
}

/**
 * Punto de mira pixelado del botón de calibrar. Dibujado con rects sobre una
 * rejilla de 16×16 y `shapeRendering="crispEdges"` para que no se antialiase.
 */
function IconTargetPixel() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      {/* Marcas exteriores */}
      <rect x="7" y="0" width="2" height="2" />
      <rect x="7" y="14" width="2" height="2" />
      <rect x="0" y="7" width="2" height="2" />
      <rect x="14" y="7" width="2" height="2" />
      {/* Anillo */}
      <rect x="5" y="3" width="6" height="1" />
      <rect x="5" y="12" width="6" height="1" />
      <rect x="3" y="5" width="1" height="6" />
      <rect x="12" y="5" width="1" height="6" />
      <rect x="4" y="4" width="1" height="1" />
      <rect x="11" y="4" width="1" height="1" />
      <rect x="4" y="11" width="1" height="1" />
      <rect x="11" y="11" width="1" height="1" />
      {/* Centro */}
      <rect x="7" y="7" width="2" height="2" />
    </svg>
  );
}

/**
 * Vista de la ventana flotante: solo el avatar, sin marco ni fondo.
 * El audio y las notificaciones los gestiona la ventana principal
 * (AvatarCanvas); aquí solo se renderiza para no duplicar sonidos.
 */
export function PipView({ gameState, lastFrame, onCalibrate }: PipViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(gameState);
  const frameRef = useRef(lastFrame);
  const [isCalibrating, setIsCalibrating] = useState(false);

  const handleCalibrate = async () => {
    if (onCalibrate === undefined || isCalibrating) return;
    setIsCalibrating(true);
    try {
      await onCalibrate();
    } finally {
      setIsCalibrating(false);
    }
  };

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
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Calibrar sin volver a la pestaña principal. Los estilos van en línea
          a propósito: el documento de la ventana flotante recibe una copia de
          las hojas del padre, pero esa copia es best-effort y un botón que se
          quede sin estilo aquí es un botón invisible. */}
      {onCalibrate !== undefined && (
        <button
          onClick={handleCalibrate}
          disabled={isCalibrating}
          title={isCalibrating ? 'Calibrando…' : 'Calibrar postura'}
          aria-label={isCalibrating ? 'Calibrando' : 'Calibrar postura'}
          style={{
            position: 'absolute',
            top: 5,
            left: 5,
            zIndex: 2,
            width: 28,
            height: 28,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            border: '2px solid #241a10',
            borderRadius: 6,
            background: isCalibrating
              ? 'linear-gradient(180deg, #6b7f8c 0%, #47606f 100%)'
              : 'linear-gradient(180deg, #4f93bd 0%, #2f6a91 100%)',
            boxShadow:
              'inset 0 2px 0 1px rgba(180,225,255,0.34), 0 3px 0 0 #1e455f, 0 5px 10px -3px rgba(0,0,0,0.6)',
            cursor: isCalibrating ? 'progress' : 'pointer',
            opacity: isCalibrating ? 0.75 : 1,
          }}
        >
          <IconTargetPixel />
        </button>
      )}
      {/* El canvas mide 128×176 internamente (sprite + HUD de 48px).
          Ocupa toda la ventana y se ajusta con `object-fit: contain`, que es
          lo que hace que el avatar crezca o se encoja tanto al cambiar el
          ancho como al cambiar el alto. Con `height: 100%` y `width: auto`
          solo mandaba la altura: al ensanchar la ventana no pasaba nada.
          `contain` mantiene la proporción, así que nunca se deforma; si la
          ventana queda muy ancha o muy alta aparece margen, no estiramiento. */}
      <canvas
        ref={canvasRef}
        style={{
          imageRendering: 'pixelated',
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}
