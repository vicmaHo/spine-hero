import { useEffect, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { NickForm } from './NickForm';

/**
 * Puerta de escape SOLO para desarrollo: entra directo al Dashboard saltándose
 * el Formulario_Acceso. Existe porque el acceso necesita un
 * `amplify_outputs.json` al día, y sin él no se puede trabajar en el dashboard.
 *
 * Doble condición a propósito:
 *  - solo en localhost, así nunca se activa en el dominio desplegado;
 *  - solo con la marca puesta a mano, así no se activa por accidente.
 *
 * Activar, en la consola del navegador:
 *   localStorage.setItem('spinehero.devSkipNick', '1')
 * Desactivar:
 *   localStorage.removeItem('spinehero.devSkipNick')
 *
 * No toca la lógica de identidad: si la marca no está, el flujo es el normal.
 */
const DEV_SKIP_KEY = 'spinehero.devSkipNick';

function shouldSkipNick(): boolean {
  const { hostname } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return false;
  try {
    return localStorage.getItem(DEV_SKIP_KEY) === '1';
  } catch {
    // Almacenamiento bloqueado: se sigue el flujo normal.
    return false;
  }
}

interface NickGateProps {
  children: ReactNode;
  /** Vuelve a la landing desde el acceso. Sin esto el acceso no tiene salida. */
  onBack?: () => void;
}

/**
 * Envuelve el Dashboard. Llama a `bootstrapIdentity()` al montar y elige
 * entre pantalla de carga, Formulario_Acceso o Dashboard según
 * `identityPhase` (Req 1.1, 4.2). La fase de carga es una lectura de
 * IndexedDB acotada a 3 s (Req 4.7): no arranca nada de detección, motor de
 * juego ni escritura de minutos por sí misma, así que mostrarla brevemente
 * no bloquea esos módulos (Req 12.4), que solo se activan cuando el usuario
 * pulsa «Iniciar» en un Dashboard ya montado.
 *
 * En la práctica esta carga queda oculta detrás de la SplashScreen, que se
 * monta encima durante el arranque; se estiliza igualmente porque también se
 * ve si el navegador tarda más que la splash.
 */
export function NickGate({ children, onBack }: NickGateProps) {
  const identityPhase = useAppStore((s) => s.identityPhase);
  const bootstrapIdentity = useAppStore((s) => s.bootstrapIdentity);
  const skipNick = shouldSkipNick();

  useEffect(() => {
    // Con la marca de desarrollo puesta no se arranca la identidad: así no
    // aparecen los errores de backend en consola mientras se trabaja offline.
    if (skipNick) return;
    void bootstrapIdentity();
    // Solo al montar: `bootstrapIdentity` es una acción estable de Zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (skipNick) {
    return (
      <>
        {/* Aviso permanente: sin esto es fácil olvidar que el acceso está
            saltado y confundirlo con un fallo del login. */}
        <div
          className="fixed bottom-3 left-3 z-[90] rounded-md border-2 border-[#241a10] px-3 py-2"
          style={{
            background: 'linear-gradient(180deg, #c4523c 0%, #932f22 100%)',
            boxShadow: 'inset 0 2px 0 1px rgba(255,180,160,0.3), 0 3px 0 0 #5e1b12',
          }}
          role="status"
        >
          <span className="font-pixel text-[8px] text-white">ACCESO SALTADO (DEV)</span>
        </div>
        {children}
      </>
    );
  }

  if (identityPhase === 'loading') {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: 'var(--backdrop-deep)' }}
        role="status"
        aria-live="polite"
      >
        <p className="font-pixel animate-pulse text-[10px] text-[#f2cf6b]">CARGANDO…</p>
      </div>
    );
  }

  if (identityPhase === 'form') {
    return <NickForm onBack={onBack} />;
  }

  // 'granted' o 'guest': paso al Dashboard.
  return <>{children}</>;
}

export default NickGate;
