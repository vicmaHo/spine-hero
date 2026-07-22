import { useEffect } from 'react';
import { Dashboard } from './ui/Dashboard';
import { useAppStore } from './store/useAppStore';
import { createMockPostureSource } from './contracts/mockSource';

function App() {
  useEffect(() => {
    // Inicializar con mock source como fuente predeterminada
    const mockSource = createMockPostureSource();
    useAppStore.getState().swapSource(mockSource, 'mock');
  }, []);

  return <Dashboard />;
}

export default App;
