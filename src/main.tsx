import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
import './index.css'
import App from './App.tsx'

// Conecta la app con el backend desplegado (endpoint de AppSync, Cognito…).
// Envuelto en try/catch: el arranque no debe depender de la nube (sin red o
// sin config, la app sigue renderizando en local).
try {
  Amplify.configure(outputs)
} catch {
  // DEBUG: fallo de configuración de Amplify, la app sigue funcionando en local
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
