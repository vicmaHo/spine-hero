import { defineAuth } from '@aws-amplify/backend';

// El acceso de invitado (guest) NO se configura aquí: se habilita
// automáticamente al usar `allow.guest()` en las reglas de autorización de los
// modelos de `data/resource.ts` (DailyRecord ya lo hace). `defineAuth.access`
// es solo para dar permisos a otros recursos, no admite `allow.guest()`.
export const auth = defineAuth({
  loginWith: { email: true },
});
