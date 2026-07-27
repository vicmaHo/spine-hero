import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Aviso de sesión «Continuar sin nick» (Requisito 12 criterio 2): no captura
 * el foco, no impide ninguna acción del Dashboard y no requiere cerrarse
 * para seguir usando la aplicación. Su visibilidad es estado LOCAL del
 * componente (no vive en el store): cerrarlo es una preferencia de esta
 * sesión de render, no una transición de identidad.
 */
export function GuestNotice() {
  const identityPhase = useAppStore((s) => s.identityPhase);
  const openNickForm = useAppStore((s) => s.openNickForm);
  const [dismissed, setDismissed] = useState(false);

  if (identityPhase !== 'guest' || dismissed) return null;

  return (
    <div
      role="status"
      className="col-span-12 bg-amber-900/30 border border-amber-700 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-amber-200">
        Estás usando la app sin nick: tu progreso no se sincroniza ni aparece en el ranking.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={openNickForm}
          className="px-3 py-1.5 rounded-lg bg-amber-600 text-xs font-medium text-white hover:bg-amber-500 transition-colors"
        >
          Elegir nick
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso"
          className="px-2 py-1.5 rounded-lg text-amber-300 hover:text-amber-100 hover:bg-amber-800/50 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default GuestNotice;
