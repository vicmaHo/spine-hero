import { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { openPipWindow, PIP_THEME_COLOR } from './documentPip';
import { PipView } from './PipView';
import { useAppStore } from '../store/useAppStore';
import backgroundHero from '../assets/background-hero.png';

/**
 * Botón que abre la ventana flotante PiP con el avatar.
 * La ventana se posiciona abajo-izquierda de la pantalla.
 * Debe invocarse desde un gesto del usuario (click).
 */
export function PipButton() {
  const [pipOpen, setPipOpen] = useState(false);

  const handleOpen = useCallback(async () => {
    if (pipOpen) return;

    try {
      const { pipWindow } = await openPipWindow();

      // El documento de la PiP va sin márgenes y con fondo oscuro sólido.
      // El navegador no permite fondo transparente en una ventana PiP: si se
      // deja en 'transparent' pinta blanco por defecto.
      // La URL del asset es absoluta al origen, así que resuelve igual desde
      // el documento de la ventana flotante.
      const { documentElement, body } = pipWindow.document;
      const base = `margin:0;padding:0;height:100%;background-color:${PIP_THEME_COLOR};`;
      documentElement.style.cssText = base;
      body.style.cssText =
        base +
        'overflow:hidden;' +
        `background-image:url(${backgroundHero});` +
        'background-size:cover;background-position:center;background-repeat:no-repeat;';

      const container = pipWindow.document.createElement('div');
      container.id = 'pip-root';
      container.style.cssText = 'width:100%;height:100%;';
      body.appendChild(container);

      // Montar React en la ventana PiP
      const root = createRoot(container);

      // Componente wrapper que se suscribe al store
      function PipApp() {
        const gameState = useAppStore((s) => s.game);
        const lastFrame = useAppStore((s) => s.frame);

        return <PipView gameState={gameState} lastFrame={lastFrame} />;
      }

      root.render(<PipApp />);
      setPipOpen(true);

      // Detectar cierre de la ventana PiP
      const checkClosed = setInterval(() => {
        if (pipWindow.closed) {
          clearInterval(checkClosed);
          root.unmount();
          setPipOpen(false);
        }
      }, 500);

      // También escuchar evento pagehide (Document PiP nativo)
      pipWindow.addEventListener('pagehide', () => {
        clearInterval(checkClosed);
        root.unmount();
        setPipOpen(false);
      });
    } catch {
      // El usuario canceló o el navegador bloqueó la ventana
      setPipOpen(false);
    }
  }, [pipOpen]);

  return (
    <button onClick={handleOpen} disabled={pipOpen} className="rpg-btn rpg-btn-purple w-full">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <rect x="12" y="12" width="7" height="6" rx="1" fill="currentColor" stroke="none" />
        <path d="M3 8h18" />
      </svg>
      {pipOpen ? 'VENTANA FLOTANTE ACTIVA' : 'ABRIR VENTANA FLOTANTE'}
    </button>
  );
}
