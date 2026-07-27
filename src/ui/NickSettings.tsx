import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

function IconLogout() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden="true">
      <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Identidad activa y cierre de sesión, dentro del panel de controles.
 *
 * Muestra el Nick activo y ofrece el cierre de sesión, que borra los datos
 * locales (identidad, minutos y perfil) y devuelve al Formulario_Acceso.
 *
 * **Desviación declarada del Requisito 5 criterio 1**, que pide ofrecer un
 * formulario de cambio de Nick mientras haya un Nick activo: se retiró por
 * decisión del usuario para dejar el panel con una sola acción. `changeNick`
 * sigue existiendo en el store y en el Sistema_Identidad, con sus tests, así que
 * volver a exponerlo es añadir el formulario aquí; nada más.
 *
 * Solo importa de `src/store/` (frontera de `structure.md`).
 */
export function NickSettings() {
  const identity = useAppStore((s) => s.identity);
  const switchUser = useAppStore((s) => s.switchUser);

  /** Segundo paso del cierre de sesión: evita perder el progreso de un clic. */
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  if (identity === null) return null; // sin identidad activa, no hay nada que mostrar

  return (
    <div className="flex flex-col gap-1.5">
      <span className="rpg-label">MI NICK</span>

      {/* Hueco claro sobre el pergamino, igual que los avisos del dashboard */}
      <p
        className="truncate rounded-md border-2 border-[#c9ab74] bg-[rgba(255,255,255,0.34)] px-2.5 py-1.5 text-[13px] font-bold text-[#3b2a1c]"
        title={identity.nick}
      >
        {identity.nick}
      </p>

      {/* Cierre de sesión. Es destructivo —vacía identidad, minutos y perfil—
          así que pide confirmación en dos pasos dentro del propio panel, sin
          diálogos del navegador. */}
      {!confirmingLogout ? (
        <button
          type="button"
          onClick={() => setConfirmingLogout(true)}
          className="rpg-btn rpg-btn-wood rpg-btn-sm w-full"
        >
          <IconLogout />
          CERRAR SESIÓN
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border-2 border-[#c4523c] bg-[rgba(196,82,60,0.18)] px-2.5 py-2">
          <p id="logout-warning" className="text-[11px] font-medium leading-snug text-[#8e2820]">
            ¿Seguro? Se borrarán de este equipo tu progreso, tu calibración y los
            minutos de hoy. Tu nick seguirá existiendo para volver a entrar.
          </p>
          <button
            type="button"
            onClick={() => void switchUser()}
            aria-describedby="logout-warning"
            className="rpg-btn rpg-btn-red rpg-btn-sm w-full"
          >
            SÍ, CERRAR Y BORRAR
          </button>
          <button
            type="button"
            onClick={() => setConfirmingLogout(false)}
            className="rpg-btn rpg-btn-wood rpg-btn-sm w-full"
          >
            CANCELAR
          </button>
        </div>
      )}
    </div>
  );
}

export default NickSettings;
