import { useCallback, useState } from 'react';
import { Dashboard } from './ui/Dashboard';
import { SplashScreen } from './ui/SplashScreen';

function App() {
  const [booted, setBooted] = useState(false);

  // useCallback: la splash lo tiene como dependencia de su efecto, así que
  // una referencia estable evita que el efecto se reinicie en cada render.
  const handleFinish = useCallback(() => setBooted(true), []);

  return (
    <>
      {/* El Dashboard se monta desde el principio, detrás de la splash: así el
          renderer del compañero ya está caliente cuando la pantalla se retira. */}
      <Dashboard />
      {!booted && <SplashScreen onFinish={handleFinish} />}
    </>
  );
}

export default App;
