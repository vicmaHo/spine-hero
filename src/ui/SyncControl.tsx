import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/**
 * Sincronización con la nube.
 *
 * La identidad ya no depende de Cognito (ver spec identidad-nick): el acceso se
 * decide por Nick en el Formulario_Acceso, así que aquí ya no hay login ni
 * cierre de sesión —eso vive en `NickSettings`—. Este control se limita a
 * disparar una sincronización manual y mostrar su resultado.
 *
 * Sin Nick activo no se sincroniza nada (Req 12.3), así que en sesión de
 * invitado el control se retira: `GuestNotice` es quien explica por qué y
 * ofrece elegir un nick. Un botón que no puede hacer nada engaña más de lo
 * que informa.
 */
export function SyncControl() {
  const syncNow = useAppStore((s) => s.syncNow);
  const identityPhase = useAppStore((s) => s.identityPhase);
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

  if (identityPhase !== 'granted') return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#4a7a30]">
        <span className="animate-rpg-blink h-2 w-2 rounded-full bg-[#6ea84a]" />
        Sincronizando con la nube
      </span>
      <button onClick={handleSyncNow} className="rpg-btn rpg-btn-purple rpg-btn-sm w-full">
        SINCRONIZAR AHORA
      </button>
      {syncMsg && <p className="text-center text-[11px] font-medium text-[#5c4128]">{syncMsg}</p>}
    </div>
  );
}
