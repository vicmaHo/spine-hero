import { useEffect, useRef, useState } from 'react';
import { useAppStore, type NickFormMode } from '../store/useAppStore';
import { canSubmit } from './nickFormState';
import backgroundDashboard from '../assets/background-dashboard.png';
import logo from '../assets/logo.png';

/* ── Iconografía inline: sin peticiones de red ── */

function IconShield() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l7 3v6.2c0 4.4-2.9 8.4-7 10.8-4.1-2.4-7-6.4-7-10.8V5l7-3z" />
    </svg>
  );
}

function IconEnter() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M5 12h12M13 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="M14 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface NickFormProps {
  /** Vuelve a la landing. Si no se pasa, el acceso no muestra salida. */
  onBack?: () => void;
}

/**
 * Formulario_Acceso: pide el Nick (y el correo en «Crear nick») antes de dar
 * paso al Dashboard. Solo importa de `src/store/` y de su vecino
 * `nickFormState.ts` (frontera del Requisito 11 criterio 5: nunca
 * `src/storage/` directamente).
 *
 * Viste el mismo mundo que la landing y el dashboard: fondo pixel art,
 * paneles de pergamino con marco tallado y botones en relieve. La lógica de
 * identidad es la misma; lo que cambia respecto a la primera versión es solo
 * la presentación.
 */
export function NickForm({ onBack }: NickFormProps) {
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

  /** Pestaña del selector de modo: dorada la activa, madera la otra. */
  const tabClass = (tabMode: NickFormMode) =>
    `rpg-btn rpg-btn-sm flex-1 ${tabMode === mode ? 'rpg-btn-gold' : 'rpg-btn-wood'}`;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">

      {/* Fondo del mundo: mismo tratamiento que la landing y el dashboard */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${backgroundDashboard})`, opacity: 0.45 }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 130% 105% at 50% 42%, rgba(18,14,10,0.22) 34%, rgba(18,14,10,0.66) 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex w-full max-w-[430px] flex-col items-center gap-6">

        {/* Marca, con el halo cálido de la splash */}
        <div className="relative flex items-center justify-center">
          <div
            className="animate-rpg-glow pointer-events-none absolute h-[150%] w-[150%] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(242,207,107,0.28) 0%, transparent 66%)' }}
            aria-hidden="true"
          />
          <img
            src={logo}
            alt="SPINE HERO"
            className="pixelated relative w-[min(68vw,300px)] drop-shadow-[0_6px_14px_rgba(0,0,0,0.7)]"
          />
        </div>

        <section className="rpg-panel w-full px-5 pb-5 pt-8">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="rpg-ribbon">
              <IconShield />
              ELIGE TU NICK
            </span>
          </div>

          {/* Selector de modo */}
          <div className="flex gap-2" role="group" aria-label="Modo de acceso">
            <button
              type="button"
              onClick={() => handleModeSwitch('signIn')}
              aria-pressed={mode === 'signIn'}
              className={tabClass('signIn')}
            >
              YA TENGO NICK
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('signUp')}
              aria-pressed={mode === 'signUp'}
              className={tabClass('signUp')}
            >
              CREAR NICK
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3.5">

            {/* Campo Nick */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nick-input" className="rpg-label">NICK</label>
              <input
                ref={nickInputRef}
                id="nick-input"
                type="text"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                maxLength={16}
                aria-describedby="nick-help"
                aria-invalid={nickInvalid}
                className="rpg-field w-full"
                placeholder="3-16 caracteres"
                autoComplete="off"
              />
              <p id="nick-help" className="text-[11px] font-medium text-[#5c4128]">
                Letras, números, guion o guion bajo.
              </p>
            </div>

            {/* Campo Correo (solo en «Crear nick», Req 2.2) */}
            {mode === 'signUp' && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email-input" className="rpg-label">CORREO ELECTRÓNICO</label>
                <input
                  ref={emailInputRef}
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  aria-describedby="email-help"
                  aria-invalid={emailInvalid}
                  className="rpg-field w-full"
                  placeholder="tu@correo.com"
                  autoComplete="off"
                />
                {/* Siempre visible mientras el modo es «Crear nick» (Req 8.2) */}
                <p id="email-help" className="text-[11px] font-medium leading-snug text-[#5c4128]">
                  Tu correo solo se usa para evitar nicks duplicados. En el ranking solo aparece tu nick
                </p>
              </div>
            )}

            {/* Mensaje de error / estado (Req 8.9: role="alert") */}
            {identityMessage && (
              <div role="alert" className="flex flex-col gap-2">
                <p className="rounded-md border-2 border-[#c4523c] bg-[rgba(196,82,60,0.18)] px-3 py-2 text-[11px] font-medium leading-snug text-[#8e2820]">
                  {identityMessage}
                </p>
                {emailTakenNick && (
                  <button
                    type="button"
                    onClick={handleEnterExistingNick}
                    disabled={identityBusy}
                    className="rpg-btn rpg-btn-blue rpg-btn-sm w-full"
                  >
                    ENTRAR CON ESE NICK
                  </button>
                )}
                {isRetryable && (
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={identityBusy}
                    className="rpg-btn rpg-btn-wood rpg-btn-sm w-full"
                  >
                    REINTENTAR
                  </button>
                )}
              </div>
            )}

            {/* Envío */}
            <button type="submit" disabled={!canSubmitNow} className="rpg-btn rpg-btn-green w-full">
              {mode === 'signUp' ? <IconSpark /> : <IconEnter />}
              {identityBusy ? 'COMPROBANDO…' : mode === 'signUp' ? 'CREAR NICK' : 'ENTRAR'}
            </button>
          </form>

          {/* «Continuar sin nick» — solo visible sin conexión (Req 12.1, 12.6) */}
          {!isOnline && (
            <button
              type="button"
              onClick={continueWithoutNick}
              className="mt-3 w-full text-center text-[11px] font-medium text-[#8a6239] underline decoration-dotted transition-colors hover:text-[#5c4128]"
            >
              Continuar sin nick
            </button>
          )}

          {/* Aviso permanente, visible en ambos modos (Req 10.5) */}
          <p className="mt-4 rounded-md border-2 border-[#d9a938] bg-[rgba(242,207,107,0.34)] px-2.5 py-2 text-center text-[11px] font-medium leading-snug text-[#6b4c12]">
            Ranking amistoso: la identidad por nick no está verificada
          </p>
        </section>

        {onBack && (
          <button onClick={onBack} className="rpg-btn rpg-btn-wood rpg-btn-sm">
            <IconBack />
            VOLVER AL INICIO
          </button>
        )}
      </div>
    </div>
  );
}

export default NickForm;
