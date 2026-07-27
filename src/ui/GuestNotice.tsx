import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Aviso de sesión «Continuar sin nick» (Requisito 12 criterio 2): no captura
 * el foco, no impide ninguna acción del Dashboard y no requiere cerrarse
 * para seguir usando la aplicación. Su visibilidad es estado LOCAL del
 * componente (no vive en el store): cerrarlo es una preferencia de esta
 * sesión de render, no una transición de identidad.
 *
 * Va en dorado, el color de aviso del resto del dashboard, para que se lea
 * como advertencia y no como error.
 */
export function GuestNotice() {
  const identityPhase = useAppStore((s) => s.identityPhase);
  const openNickForm = useAppStore((s) => s.openNickForm);
  const [dismissed, setDismissed] = useState(false);

  if (identityPhase !== 'guest' || dismissed) return null;

  return (
    <div
      role="status"
      className="col-span-12 flex flex-wrap items-center justify-between gap-3 rounded-lg border-[3px] border-[#241a10] px-4 py-3"
      style={{
        background: 'linear-gradient(180deg, #f2cf6b 0%, #d9a938 100%)',
        boxShadow:
          'inset 0 0 0 2px rgba(255,245,205,0.45), inset 0 2px 0 3px rgba(255,255,255,0.35), 0 5px 0 0 rgba(120,85,15,0.55), 0 12px 26px -8px rgba(0,0,0,0.6)',
      }}
    >
      <p className="text-[13px] font-semibold leading-snug text-[#4a3510]">
        Estás usando la app sin nick: tu progreso no se sincroniza ni aparece en el ranking.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={openNickForm} className="rpg-btn rpg-btn-green rpg-btn-sm">
          ELEGIR NICK
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso"
          className="rounded-md border-2 border-[#8a5f12] bg-[rgba(255,255,255,0.28)] px-2 py-1 text-[13px] font-bold text-[#5c3f0e] transition-colors hover:bg-[rgba(255,255,255,0.5)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default GuestNotice;
