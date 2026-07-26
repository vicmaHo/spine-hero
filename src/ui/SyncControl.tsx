import { useEffect, useState } from 'react';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import { useAppStore } from '../store/useAppStore';

/**
 * Login OPCIONAL para la sincronización con la nube.
 *
 * La app funciona entera sin iniciar sesión (requisito de producto: la demo no
 * puede exigir registrarse). Este control solo AÑADE la sincronización: cuando
 * el usuario se autentica, arranca el `synchronizer`; al cerrar sesión, lo para.
 * Por eso no envolvemos la app en un `<Authenticator>` que bloquee la entrada.
 */
export function SyncControl() {
  const { authStatus, signOut } = useAuthenticator((c) => [c.authStatus]);
  const onAuthReady = useAppStore((s) => s.onAuthReady);
  const onAuthLost = useAppStore((s) => s.onAuthLost);
  const syncNow = useAppStore((s) => s.syncNow);
  const [showLogin, setShowLogin] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Puente entre el estado de Amplify y el store: enciende/apaga el sync.
  useEffect(() => {
    if (authStatus === 'authenticated') {
      onAuthReady();
      setShowLogin(false);
    } else if (authStatus === 'unauthenticated') {
      onAuthLost();
    }
  }, [authStatus, onAuthReady, onAuthLost]);

  const handleSyncNow = async () => {
    setSyncMsg('Enviando…');
    try {
      await syncNow();
      setSyncMsg('Checkpoint enviado ✓');
    } catch {
      setSyncMsg('Error al sincronizar');
    }
    setTimeout(() => setSyncMsg(''), 3000);
  };

  if (authStatus === 'authenticated') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center gap-1.5 text-[11px] font-bold text-[#4a7a30]">
            <span className="animate-rpg-blink h-2 w-2 rounded-full bg-[#6ea84a]" />
            Sincronizando con la nube
          </span>
          <button onClick={signOut} className="rpg-btn rpg-btn-sm shrink-0" style={{ background: 'linear-gradient(180deg, #8a6239 0%, #5c4128 100%)', boxShadow: 'inset 0 2px 0 2px rgba(255,220,170,0.2), 0 4px 0 0 #3b2a1c' }}>
            SALIR
          </button>
        </div>
        <button onClick={handleSyncNow} className="rpg-btn rpg-btn-purple rpg-btn-sm w-full">
          SINCRONIZAR AHORA
        </button>
        {syncMsg && <p className="text-center text-[11px] font-medium text-[#5c4128]">{syncMsg}</p>}
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setShowLogin(true)} className="rpg-btn rpg-btn-purple w-full">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M6.5 18h11a3.5 3.5 0 00.3-6.98A5.5 5.5 0 007.2 9.2A3.9 3.9 0 006.5 18z" strokeLinejoin="round" />
        </svg>
        INICIAR SESIÓN PARA SINCRONIZAR
      </button>

      {showLogin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,16,12,0.82)] p-4 backdrop-blur-sm"
          onClick={() => setShowLogin(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* stopPropagation: clic dentro del formulario no cierra el modal */}
          <div onClick={(e) => e.stopPropagation()} className="rpg-panel p-4">
            <Authenticator />
          </div>
        </div>
      )}
    </>
  );
}
