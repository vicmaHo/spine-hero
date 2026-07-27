import { useCallback, useEffect, useState } from 'react';
import { Dashboard } from './ui/Dashboard';
import { LandingPage } from './ui/LandingPage';
import { NickGate } from './ui/NickGate';
import { SplashScreen } from './ui/SplashScreen';

/**
 * landing → el usuario está leyendo la presentación.
 * loading → pulsó Empezar ahora: el acceso se monta detrás de la splash.
 * app     → la aplicación ya está a la vista (Formulario_Acceso o dashboard).
 */
type View = 'landing' | 'loading' | 'app';

function App() {
  const [view, setView] = useState<View>('landing');

  // useCallback: la splash tiene onFinish como dependencia de su efecto, así
  // que una referencia estable evita que el efecto se reinicie en cada render.
  const handleStart = useCallback(() => setView('loading'), []);
  const handleReady = useCallback(() => setView('app'), []);
  const handleBackToLanding = useCallback(() => setView('landing'), []);

  // Al salir de la landing, volver arriba: el scroll heredado dejaría el
  // dashboard a media página.
  useEffect(() => {
    if (view !== 'landing') window.scrollTo(0, 0);
  }, [view]);

  return (
    <>
      {/* Durante 'loading' el NickGate ya está montado detrás de la splash: su
          `bootstrapIdentity()` lee IndexedDB mientras la pantalla de carga está
          visible, y si había un Nick guardado el Dashboard arranca ahí detrás
          con el renderer y el audio ya calientes. Al retirarse la splash, lo
          que aparece es el dashboard o el acceso, sin parpadeos intermedios. */}
      {view === 'landing' ? (
        <LandingPage onStart={handleStart} />
      ) : (
        <NickGate onBack={handleBackToLanding}>
          <Dashboard onBackToLanding={handleBackToLanding} />
        </NickGate>
      )}
      {view === 'loading' && <SplashScreen onFinish={handleReady} />}
    </>
  );
}

export default App;
