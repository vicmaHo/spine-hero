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
          <span className="flex-1 text-xs text-green-400">● Sincronizando con la nube</span>
          <button
            onClick={signOut}
            className="px-3 py-1.5 rounded-lg bg-gray-700 text-xs font-medium hover:bg-gray-600 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
        <button
          onClick={handleSyncNow}
          className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium hover:bg-indigo-500 transition-colors"
        >
          Sincronizar ahora
        </button>
        {syncMsg && <p className="text-xs text-gray-400 text-center">{syncMsg}</p>}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowLogin(true)}
        className="w-full px-3 py-2 rounded-lg bg-indigo-600 text-sm font-medium hover:bg-indigo-500 transition-colors"
      >
        Iniciar sesión para sincronizar
      </button>

      {showLogin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowLogin(false)}
          role="dialog"
          aria-modal="true"
        >
          {/* stopPropagation: clic dentro del formulario no cierra el modal */}
          <div onClick={(e) => e.stopPropagation()}>
            <Authenticator />
          </div>
        </div>
      )}
    </>
  );
}
