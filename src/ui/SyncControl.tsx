import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Sincronización con la nube.
 *
 * La identidad ya no depende de Cognito (ver spec identidad-nick): el acceso se
 * decide por nick, no por login. Este control se limita a disparar una
 * sincronización manual y mostrar su resultado.
 */
export function SyncControl() {
  const syncNow = useAppStore((s) => s.syncNow);
  const [syncMsg, setSyncMsg] = useState('');

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

  return (
    <div className="flex flex-col gap-2">
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
