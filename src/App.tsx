import { useCallback, useEffect, useState } from 'react';
import { Dashboard } from './ui/Dashboard';
import { LandingPage } from './ui/LandingPage';
import { SplashScreen } from './ui/SplashScreen';

/**
 * landing → el usuario está leyendo la presentación.
 * loading → pulsó Empezar ahora: el dashboard se monta detrás de la splash.
 * app     → la aplicación ya está a la vista.
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
      {/* Durante 'loading' el Dashboard ya está montado detrás de la splash:
          así el renderer del compañero y el audio arrancan mientras la
          pantalla de carga está visible, y al retirarse todo está caliente. */}
      {view === 'landing'
        ? <LandingPage onStart={handleStart} />
        : <Dashboard onBackToLanding={handleBackToLanding} />}
      {view === 'loading' && <SplashScreen onFinish={handleReady} />}
    </>
  );
}

export default App;
