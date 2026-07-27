import { useEffect, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { NickForm } from './NickForm';

interface NickGateProps {
  children: ReactNode;
}

/**
 * Envuelve el Dashboard. Llama a `bootstrapIdentity()` al montar y elige
 * entre pantalla de carga, Formulario_Acceso o Dashboard según
 * `identityPhase` (Req 1.1, 4.2). La fase de carga es una lectura de
 * IndexedDB acotada a 3 s (Req 4.7): no arranca nada de detección, motor de
 * juego ni escritura de minutos por sí misma, así que mostrarla brevemente
 * no bloquea esos módulos (Req 12.4), que solo se activan cuando el usuario
 * pulsa «Iniciar» en un Dashboard ya montado.
 */
export function NickGate({ children }: NickGateProps) {
  const identityPhase = useAppStore((s) => s.identityPhase);
  const bootstrapIdentity = useAppStore((s) => s.bootstrapIdentity);

  useEffect(() => {
    void bootstrapIdentity();
    // Solo al montar: `bootstrapIdentity` es una acción estable de Zustand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (identityPhase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-xs text-gray-400">Cargando…</p>
      </div>
    );
  }

  if (identityPhase === 'form') {
    return <NickForm />;
  }

  // 'granted' o 'guest': paso al Dashboard.
  return <>{children}</>;
}

export default NickGate;
