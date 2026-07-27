import { useEffect, useRef, useState } from 'react';
import { useAppStore, type NickFormMode } from '../store/useAppStore';
import { canSubmit } from './nickFormState';

/**
 * Formulario_Acceso: pide el Nick (y el correo en «Crear nick») antes de dar
 * paso al Dashboard. Solo importa de `src/store/` y de su vecino
 * `nickFormState.ts` (frontera del Requisito 11 criterio 5: nunca
 * `src/storage/` directamente).
 */
export function NickForm() {
  const [mode, setMode] = useState<NickFormMode>('signUp'); // «Crear nick» es el modo inicial (Req 2.1)
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const identityBusy = useAppStore((s) => s.identityBusy);
  const identityMessage = useAppStore((s) => s.identityMessage);
  const identityMessageField = useAppStore((s) => s.identityMessageField);
  const emailTakenNick = useAppStore((s) => s.emailTakenNick);
  const signUpNick = useAppStore((s) => s.signUpNick);
  const signInNick = useAppStore((s) => s.signInNick);
  const continueWithoutNick = useAppStore((s) => s.continueWithoutNick);

  const nickInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Escucha online/offline para el control «Continuar sin nick» (Req 12.1, 12.6).
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Foco al primer campo con error tras un fallo (Req 8.9).
  useEffect(() => {
    if (identityMessage && identityMessageField === 'nick') {
      nickInputRef.current?.focus();
    } else if (identityMessage && identityMessageField === 'email') {
      emailInputRef.current?.focus();
    }
  }, [identityMessage, identityMessageField]);

  const handleModeSwitch = (newMode: NickFormMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    // Conserva el nick, retira el mensaje del modo anterior (Req 2.6). El
    // mensaje vive en el store, así que se limpia usando la misma acción que
    // lo genera: un signIn/signUp fallido lo vuelve a fijar en el próximo
    // envío, y aquí no hay ningún envío en curso que perder.
    useAppStore.setState({ identityMessage: null, identityMessageField: null, emailTakenNick: null });
  };

  const canSubmitNow = canSubmit(mode, nick, email, identityBusy);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault(); // Enter no recarga la página (Req 8.8)
    if (!canSubmitNow) return;
    if (mode === 'signUp') {
      await signUpNick(nick, email);
    } else {
      await signInNick(nick);
    }
  };

  const handleEnterExistingNick = async () => {
    if (emailTakenNick) await signInNick(emailTakenNick);
  };

  const nickInvalid = identityMessage !== null && identityMessageField === 'nick';
  const emailInvalid = identityMessage !== null && identityMessageField === 'email';
  const isRetryable = identityMessage !== null && identityMessageField === null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-900 rounded-xl p-6 flex flex-col gap-4">
        <h1 className="text-sm font-semibold text-gray-200">SpineHero</h1>

        {/* Selector de modo */}
        <div className="flex gap-2" role="group" aria-label="Modo de acceso">
          <button
            type="button"
            onClick={() => handleModeSwitch('signIn')}
            aria-pressed={mode === 'signIn'}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'signIn' ? 'bg-blue-600' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Ya tengo nick
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('signUp')}
            aria-pressed={mode === 'signUp'}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === 'signUp' ? 'bg-blue-600' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Crear nick
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Campo Nick */}
          <div className="flex flex-col gap-1">
            <label htmlFor="nick-input" className="text-xs text-gray-400">Nick</label>
            <input
              ref={nickInputRef}
              id="nick-input"
              type="text"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={16}
              aria-describedby="nick-help"
              aria-invalid={nickInvalid}
              className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              placeholder="3-16 caracteres"
              autoComplete="off"
            />
            <p id="nick-help" className="text-xs text-gray-400">
              Letras, números, guion o guion bajo.
            </p>
          </div>

          {/* Campo Correo (solo en «Crear nick», Req 2.2) */}
          {mode === 'signUp' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="email-input" className="text-xs text-gray-400">Correo electrónico</label>
              <input
                ref={emailInputRef}
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                aria-describedby="email-help"
                aria-invalid={emailInvalid}
                className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                placeholder="tu@correo.com"
                autoComplete="off"
              />
              {/* Siempre visible mientras el modo es «Crear nick» (Req 8.2) */}
              <p id="email-help" className="text-xs text-gray-400">
                Tu correo solo se usa para evitar nicks duplicados. En el ranking solo aparece tu nick
              </p>
            </div>
          )}

          {/* Mensaje de error / estado (Req 8.9: role="alert") */}
          {identityMessage && (
            <div role="alert" className="flex flex-col gap-2">
              <p className="text-xs text-red-400 bg-red-900/30 rounded-lg px-3 py-1.5">
                {identityMessage}
              </p>
              {emailTakenNick && (
                <button
                  type="button"
                  onClick={handleEnterExistingNick}
                  disabled={identityBusy}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
                >
                  Entrar con ese nick
                </button>
              )}
              {isRetryable && (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={identityBusy}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors"
                >
                  Reintentar
                </button>
              )}
            </div>
          )}

          {/* Envío */}
          <button
            type="submit"
            disabled={!canSubmitNow}
            className="px-3 py-2 rounded-lg bg-green-600 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-500 transition-colors"
          >
            {identityBusy ? 'Comprobando…' : mode === 'signUp' ? 'Crear nick' : 'Entrar'}
          </button>
        </form>

        {/* «Continuar sin nick» — solo visible sin conexión (Req 12.1, 12.6) */}
        {!isOnline && (
          <button
            type="button"
            onClick={continueWithoutNick}
            className="text-xs text-gray-400 hover:text-gray-200 text-center"
          >
            Continuar sin nick
          </button>
        )}

        {/* Aviso permanente, visible en ambos modos (Req 10.5) */}
        <p className="text-xs text-gray-300 text-center">
          Ranking amistoso: la identidad por nick no está verificada
        </p>
      </div>
    </div>
  );
}

export default NickForm;
