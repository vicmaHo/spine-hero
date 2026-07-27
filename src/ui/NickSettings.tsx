import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { canSubmit } from './nickFormState';

/**
 * Cambio de Nick y «Cambiar de usuario», dentro del panel de controles.
 * Un único campo, precargado con el Nick activo (Req 5.1): nunca vuelve a
 * pedir el Correo_Vinculado (Req 5.2). Solo importa de `src/store/` y de su
 * vecino `nickFormState.ts` (frontera de `structure.md`).
 */
export function NickSettings() {
  const identity = useAppStore((s) => s.identity);
  const identityBusy = useAppStore((s) => s.identityBusy);
  const identityMessage = useAppStore((s) => s.identityMessage);
  const identityMessageField = useAppStore((s) => s.identityMessageField);
  const changeNick = useAppStore((s) => s.changeNick);
  const switchUser = useAppStore((s) => s.switchUser);

  const [nick, setNick] = useState(identity?.nick ?? '');

  // Si la identidad activa cambia (p. ej. tras un cambio de nick aceptado),
  // recarga el campo con el Nick actual: siempre precargado (Req 5.1).
  useEffect(() => {
    setNick(identity?.nick ?? '');
  }, [identity?.nick]);

  if (identity === null) return null; // sin identidad activa, no hay nada que mostrar

  // 'signIn' solo valida el Nick (ignora el correo): este formulario no tiene
  // campo de correo (Req 5.2), así que reutiliza esa rama sin duplicar el patrón.
  const canSubmitNow = canSubmit('signIn', nick, '', identityBusy);
  const nickChanged = nick.trim() !== identity.nick;
  const nickInvalid = identityMessage !== null && identityMessageField === 'nick';
  const isRetryable = identityMessage !== null && identityMessageField === null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Enter no recarga la página
    if (!canSubmitNow || !nickChanged) return;
    await changeNick(nick);
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-gray-300">Mi nick</h3>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="nick-settings-input" className="sr-only">Nick</label>
        <input
          id="nick-settings-input"
          type="text"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={16}
          aria-invalid={nickInvalid}
          aria-describedby={nickInvalid ? 'nick-settings-error' : undefined}
          className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-blue-500"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!canSubmitNow || !nickChanged}
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
        >
          {identityBusy ? 'Comprobando…' : 'Cambiar'}
        </button>
      </form>

      {identityMessage && (
        <div id="nick-settings-error" role="alert" className="flex flex-col gap-2">
          <p className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
            {identityMessage}
          </p>
          {isRetryable && (
            <button
              type="button"
              onClick={() => void changeNick(nick)}
              disabled={identityBusy}
              className="px-3 py-1.5 rounded bg-gray-600 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-500 transition-colors self-start"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void switchUser()}
        className="text-xs text-gray-500 hover:text-gray-300 text-left"
      >
        Cambiar de usuario
      </button>
    </div>
  );
}

export default NickSettings;
