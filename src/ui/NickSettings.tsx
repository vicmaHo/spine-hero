import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

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
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-gray-300">Mi nick</h3>
      <p className="text-sm text-white truncate" title={identity.nick}>
        {identity.nick}
      </p>

      {/* Cierre de sesión. Es destructivo —vacía identidad, minutos y perfil—
          así que pide confirmación en dos pasos dentro del propio panel, sin
          diálogos del navegador. */}
      {!confirmingLogout ? (
        <button
          type="button"
          onClick={() => setConfirmingLogout(true)}
          className="mt-1 px-3 py-2 rounded bg-gray-700 text-xs font-medium text-gray-200 hover:bg-gray-600 transition-colors"
        >
          Cerrar sesión
        </button>
      ) : (
        <div className="mt-1 flex flex-col gap-2 rounded bg-red-900/30 border border-red-800 px-2 py-2">
          <p id="logout-warning" className="text-xs text-red-300">
            ¿Seguro? Se borrarán de este equipo tu progreso, tu calibración y los
            minutos de hoy. Tu nick seguirá existiendo para volver a entrar.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void switchUser()}
              aria-describedby="logout-warning"
              className="px-3 py-1.5 rounded bg-red-600 text-xs font-medium text-white hover:bg-red-500 transition-colors"
            >
              Sí, cerrar sesión y borrar
            </button>
            <button
              type="button"
              onClick={() => setConfirmingLogout(false)}
              className="px-3 py-1.5 rounded bg-gray-600 text-xs font-medium text-gray-200 hover:bg-gray-500 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NickSettings;
