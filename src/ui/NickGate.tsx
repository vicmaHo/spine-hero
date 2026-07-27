import { useEffect, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { NickForm } from './NickForm';

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

  useEffect(() => {
    void bootstrapIdentity();
    // Solo al montar: `bootstrapIdentity` es una acción estable de Zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
