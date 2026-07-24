import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import outputs from '../amplify_outputs.json'
import './index.css'
import App from './App.tsx'

// Conecta la app con el backend desplegado (endpoint de AppSync, Cognito…).
// Sin esto, generateClient() y fetchAuthSession() no saben a dónde hablar.
Amplify.configure(outputs)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Provider (no bloquea la app): da contexto de auth para el login opcional */}
    <Authenticator.Provider>
      <App />
    </Authenticator.Provider>
  </StrictMode>,
)
