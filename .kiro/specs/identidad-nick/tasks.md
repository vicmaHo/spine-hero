# Implementation Plan: identidad-nick

## Overview

El orden sigue la dirección de dependencias de `structure.md`: primero el esquema
de datos y el Validador_AntiTrampa, después los módulos puros de `src/storage/`,
luego el Sistema_Identidad y el Sincronizador, después el store y, al final, la
interfaz y la retirada de Cognito. Todo el código es TypeScript en modo `strict`
(el diseño ya fija el lenguaje). Ningún paso añade dependencias npm: las
propiedades de corrección se ejecutan con Vitest sobre el generador determinista
propio descrito en el diseño (Desviación D4).

Fronteras que ninguna tarea rompe: `src/contracts/**`, `src/vision/`,
`src/posture/`, `src/game/`, `src/feedback/` y `src/pip/` quedan con diff vacío;
`src/storage/` no importa el store; `src/ui/` no importa `src/storage/`.

## Tasks

- [x] 1. Esquema de datos y almacén local de identidad
  - [x] 1.1 Añadir `UserIdentity`, `NickClaim` y `EmailClaim` al esquema
    - En `amplify/data/resource.ts`: modelo `UserIdentity` con `nick`, `nickLower` y `email`, validadores de campo (longitudes y patrones) e índices secundarios `listByNickLower` y `listByEmail`
    - `NickClaim` y `EmailClaim` con `.identifier([...])` sobre la clave de unicidad y autorización `allow.guest().to(['create','read'])` (sin `delete`)
    - `UserIdentity` autorizado a invitados solo en `create`, `read` y `update`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.9, 6.10_

  - [x] 1.2 Reautorizar `DailyRecord` y la mutación `validateAndUpdateDailyRecord`
    - En `amplify/data/resource.ts`: retirar `allow.owner()` y `allow.authenticated().to(['read'])` de `DailyRecord`, dejando `allow.guest().to(['create','read','update'])`
    - Conservar sin cambios el índice `listByTeamAndDate`
    - Mutación: `id` opcional, argumento `displayName` añadido, autorización `allow.guest()`, retorno `ValidatedUpdateResult` con `{id, date, goodPostureSeconds}`
    - _Requirements: 6.8, 6.11, 6.12, 6.13, 6.15, 13.2, 13.10, 13.11_

  - [x] 1.3 Añadir el store `identity` a IndexedDB
    - En `src/storage/db.ts`: tipo `LocalIdentityRecord` (`nick`, `userIdentityId`), store `identity` con clave `'current'`, `DB_VERSION` de 2 a 3 y migración que solo crea el store nuevo (`if (oldVersion < 3)`)
    - Sin escribir nunca el Correo_Vinculado
    - _Requirements: 4.1, 5.4, 9.8, 12.7_

- [x] 2. Validador_AntiTrampa con las siete reglas
  - [x] 2.1 Crear el módulo puro de reglas
    - Nuevo `amplify/data/anti-cheat-handler/rules.ts` con las constantes exportadas (`MAX_DAILY_SECONDS`, `TIMEZONE_SLACK_SECONDS`, `FLOW_ROUNDING_SLACK_SECONDS`, `TOLERANCE_FACTOR`, `DATE_WINDOW_DAYS`, `LEVEL_BASE_XP`, `LEVEL_EXPONENT`) y `validateWrite(input, receivedAtMs): AntiCheatVerdict`
    - Orden de evaluación: `DATE_WINDOW`, `DAILY_MAX`, `ELAPSED_TODAY`, `FLOW_VS_GOOD`, `AVG_SCORE_RANGE`, `LEVEL_XP_COHERENCE` y, solo si llegan los valores previos, `INCREMENT_VS_ELAPSED`
    - Comentario que apunta a `src/game/engine.ts` como origen de las constantes de nivel duplicadas (`amplify/` no puede importar de `src/`)
    - _Requirements: 6.14, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.12_

  - [x] 2.2 Reducir el handler a veredicto y persistencia
    - En `amplify/data/anti-cheat-handler/handler.ts`: invocar `validateWrite`, lanzar `Error(\`${ANTICHEAT_REJECT_TOKEN}: ${verdict.message}\`)` al rechazar sin emitir ninguna escritura, y al aceptar persistir (`create` sin `id`, `update` con `id`) devolviendo `{id, date, goodPostureSeconds}`
    - _Requirements: 13.1, 13.10, 13.11, 6.8_

  - [x]* 2.3 Escribir test de propiedad para las reglas anti-trampa
    - **Property 15: El veredicto anti-trampa es la conjunción de sus reglas**
    - En `amplify/data/anti-cheat-handler/rules.test.ts`, incluida la invariancia de las seis primeras reglas frente a `previousGoodPostureSeconds` y `previousUpdatedAt`
    - **Validates: Requirements 6.14, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.12**

  - [x]* 2.4 Escribir test de propiedad para el efecto del veredicto
    - **Property 16: Efecto del veredicto y clasificación del fallo (parte del handler)**
    - Con `fakeDailyRecordWriter`: cero escrituras al rechazar con mensaje prefijado por `ANTICHEAT_REJECT`, exactamente una escritura al aceptar
    - **Validates: Requirements 13.1, 13.10, 13.11, 6.8**

- [x] 3. Checkpoint - Esquema y anti-trampa
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Reglas puras de nick y correo
  - [x] 4.1 Crear `src/storage/nickRules.ts`
    - Constantes arriba y exportadas (`NICK_MIN_LENGTH`, `NICK_MAX_LENGTH`, `NICK_PATTERN`, `NICK_LOWER_PATTERN`, `EMAIL_MIN_LENGTH`, `EMAIL_MAX_LENGTH`, `EMAIL_PATTERN`)
    - `normalizeNick`, `toNickLower`, `normalizeEmail`, `isValidNick`, `isValidEmail`. Módulo puro: sin red, sin DOM
    - _Requirements: 1.2, 1.3, 1.4, 1.7_

  - [x]* 4.2 Crear el generador determinista de casos
    - `src/storage/__tests__/gen.ts`: PRNG xorshift32 con semilla fija y generadores de nick, correo, `Checkpoint`, `GameState` y secuencias de operaciones; 200 casos por propiedad e impresión de semilla y caso al fallar
    - _Requirements: 11.8_

  - [x]* 4.3 Escribir test de propiedad para la normalización del nick
    - **Property 1: La normalización del nick es idempotente y coherente**
    - En `src/storage/nickRules.test.ts`
    - **Validates: Requirements 1.3, 6.10**

  - [x]* 4.4 Escribir test de propiedad para la validez del nick
    - **Property 2: Un nick se acepta exactamente cuando cumple el patrón**
    - Incluye los ejemplos de frontera: 2, 3, 16 y 17 caracteres, y caracteres fuera del alfabeto
    - **Validates: Requirements 1.2, 1.6, 2.7, 5.5, 8.4**

  - [x]* 4.5 Escribir test de propiedad para la validez del correo
    - **Property 3: Un correo se acepta exactamente cuando cumple patrón y longitud**
    - **Validates: Requirements 1.4, 1.7, 8.5**

- [x] 5. Errores tipados y persistencia local de la identidad
  - [x] 5.1 Crear `src/storage/identityErrors.ts`
    - `ActiveIdentity`, la unión discriminada `IdentityError` con sus nueve variantes e `IdentityResult<T>`. Nada de excepciones con cadenas
    - Declarado en `src/storage/`, no en `src/contracts/`
    - _Requirements: 11.3, 11.4_

  - [x] 5.2 Crear `src/storage/identityLocal.ts`
    - `loadLocalIdentity`, `saveLocalIdentity` y `clearLocalIdentity` sobre el store `identity` con clave `'current'`
    - Un nick leído que no cumple el patrón se trata como ausencia de nick, sin borrar contenido local; nunca se guarda el correo
    - _Requirements: 4.1, 4.2, 4.4, 4.7, 9.8_

  - [x]* 5.3 Escribir test de propiedad para la coherencia del acceso concedido
    - **Property 6: El acceso concedido deja store y almacén local coherentes**
    - En `src/storage/identityLocal.test.ts`, con `fakeLocalIdentity` (lectura/escritura en memoria con fallos y retardos inyectables)
    - **Validates: Requirements 1.5, 4.1, 4.3, 4.6, 5.3, 9.8**

  - [x]* 5.4 Escribir test de propiedad para el fallo de escritura local
    - **Property 9: El fallo de escritura local no revoca el acceso**
    - **Validates: Requirements 4.8**

- [x] 6. Sistema_Identidad
  - [x] 6.1 Crear el servicio y el alta
    - `src/storage/identityService.ts`: `IDENTITY_TIMEOUT_MS`, la interfaz `IdentityDataClient`, `ClaimResult`, `withTimeout` y `createIdentityService(client)`
    - `signUp`: validación pura antes de cualquier red, guarda `navigator.onLine === false` ⇒ `OFFLINE`, `EmailClaim.create` → `listByEmail` (reutilizando la claim huérfana) → `NickClaim.create` → `UserIdentity.create` → escritura local
    - _Requirements: 1.5, 1.8, 1.9, 1.10, 1.11, 3.1, 3.2, 3.5, 3.6, 3.7, 12.3, 12.6_

  - [x] 6.2 Implementar el acceso y el cambio de nick
    - `signIn`: adopta el `nick` tal como está almacenado, nunca transmite el correo, `NICK_NOT_FOUND` si no existe
    - `changeNick`: conserva id y correo, `NICK_TAKEN` si el `nickLower` es de otra identidad, salta la claim si solo cambia la capitalización
    - Selección de campos limitada a `['id','nick']` en las dos consultas
    - _Requirements: 2.3, 2.4, 2.5, 2.8, 3.4, 5.2, 5.3, 5.6, 5.7, 6.7, 9.1, 9.2_

  - [x] 6.3 Crear el adaptador real del cliente de datos
    - `src/storage/identityClient.ts`: implementación de `IdentityDataClient` sobre `generateClient<Schema>()`, con las claims, los índices `listByNickLower`/`listByEmail` y el mapeo de la condición de clave ocupada a `{ok: false, reason: 'TAKEN'}`
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [x]* 6.4 Crear el doble `fakeIdentityClient`
    - `src/storage/__tests__/fakeIdentityClient.ts`: claims con condición de clave, índices en memoria, inyección de fallos y de retardo infinito y traza de todas las operaciones con sus argumentos
    - _Requirements: 11.8_

  - [x]* 6.5 Escribir test de propiedad para la unicidad de nick
    - **Property 4: Como máximo un UserIdentity por Nick_Normalizado**
    - En `src/storage/identityService.test.ts`
    - **Validates: Requirements 1.8, 5.6, 6.4**

  - [x]* 6.6 Escribir test de propiedad para la unicidad de correo
    - **Property 5: Como máximo un UserIdentity por Correo_Vinculado**
    - **Validates: Requirements 1.9, 3.1, 3.2, 3.6, 6.5**

  - [x]* 6.7 Escribir test de propiedad para los modos de fallo
    - **Property 7: Ningún fallo de identidad deja rastro**
    - Con temporizadores falsos de Vitest para los plazos de 3 y 10 s
    - **Validates: Requirements 1.10, 2.4, 2.8, 4.7, 5.7, 8.7, 12.3, 12.6**

  - [x]* 6.8 Escribir test de propiedad para el round trip de identidad
    - **Property 8: Entrar, salir y volver a entrar es un round trip de identidad**
    - **Validates: Requirements 2.3, 2.5, 3.4, 4.4, 4.5**

  - [x]* 6.9 Escribir test de propiedad para el cambio de nick
    - **Property 10: El cambio de nick preserva identificador, correo y progreso**
    - **Validates: Requirements 5.2, 5.4, 12.7**

  - [x]* 6.10 Escribir test de propiedad para la superficie de datos salientes
    - **Property 14: Superficie de datos salientes**
    - Sobre la traza de operaciones del doble: el `email` solo aparece en las operaciones del alta
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.7, 9.10**

- [x] 7. Checkpoint - Sistema_Identidad completo
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Sincronizador sin Cognito
  - [x] 8.1 Sustituir la guarda de sesión por el Nick inyectado
    - En `src/storage/synchronizer.ts`: `SynchronizerDeps.getIdentity`, fuera `fetchAuthSession` y `fetchUserAttributes`, `displayName` igual al `nick` activo, fuera `syncStreak` y toda referencia al modelo `Streak`
    - Sin identidad activa no se emite ninguna operación
    - _Requirements: 5.8, 5.9, 6.13, 7.1, 7.2, 7.4, 14.8, 14.9_

  - [x] 8.2 Escribir siempre por la mutación con id opcional
    - Toda escritura pasa por `client.mutations.validateAndUpdateDailyRecord`, con `id` solo si `getSyncedRecordId(date)` lo tiene, guardando el `id` devuelto con `setSyncedRecordId`
    - `isAntiCheatRejection` sin cambios: solo el token `ANTICHEAT_REJECT` es trampa, el resto es infraestructura reintentable con el backoff existente
    - _Requirements: 7.6, 7.7, 7.8, 13.13_

  - [x]* 8.3 Escribir test de propiedad para un registro por nick y fecha
    - **Property 11: Como máximo un DailyRecord por Nick y fecha**
    - En `src/storage/synchronizer.test.ts` (ampliado), con `fakeDailyRecordWriter`
    - **Validates: Requirements 7.6, 7.7, 7.8**

  - [x]* 8.4 Escribir test de propiedad para la forma de las escrituras
    - **Property 12: Forma de toda escritura del Sincronizador**
    - Incluye el caso sin Nick activo: cero operaciones emitidas
    - **Validates: Requirements 5.8, 5.9, 6.13, 7.1, 7.2, 7.4, 12.1, 14.8, 14.9**

  - [x]* 8.5 Escribir test de propiedad para la clasificación del fallo
    - **Property 16: Efecto del veredicto y clasificación del fallo (parte del cliente)**
    - Con token se abandona el envío; sin token se reintenta y los datos siguen en IndexedDB_Local
    - **Validates: Requirements 13.13, 7.8**

- [x] 9. Estado de identidad en el store
  - [x] 9.1 Crear el mapa de mensajes en español
    - `src/store/identityMessages.ts`: función pura `IdentityError → { text, field }` con los literales exactos de los requisitos, incluida la interpolación del nick en `EMAIL_TAKEN`
    - _Requirements: 1.6, 1.7, 2.4, 3.2, 4.8, 5.5, 5.6, 8.7, 12.6_

  - [x] 9.2 Añadir el slice de identidad y arrancar el Sincronizador desde el store
    - En `src/store/useAppStore.ts`: campos `identity`, `identityPhase`, `identityBusy`, `identityMessage`, `identityMessageField`, `emailTakenNick`, `localSaveFailed` y las acciones `bootstrapIdentity`, `signUpNick`, `signInNick`, `changeNick`, `switchUser`, `continueWithoutNick`, `openNickForm`
    - Al pasar a `granted` crea `createSynchronizer({ getIdentity: () => get().identity })` y fuerza un `syncNow()`; `switchUser` borra el registro local, para el Sincronizador y no toca el registro remoto
    - Retirar `isAuthenticated`, `onAuthReady` y `onAuthLost`; `changeNick` no toca `game`, `calibration` ni `teamCode`
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.8, 7.5, 12.1, 12.7, 12.8_

  - [x]* 9.3 Escribir tests unitarios de los mensajes de identidad
    - `src/store/identityMessages.test.ts`: los ocho literales exactos y el campo asociado a cada uno
    - _Requirements: 1.6, 1.7, 2.4, 3.2, 4.8, 8.7_

- [x] 10. Interfaz del acceso por nick
  - [x] 10.1 Extraer la regla del botón de envío
    - `src/ui/nickFormState.ts`: función pura `canSubmit(mode, nick, email, busy)`, testeable sin DOM
    - _Requirements: 8.3, 8.4, 8.5, 1.11_

  - [x]* 10.2 Escribir test de propiedad para la habilitación del envío
    - **Property 17: El botón de envío refleja exactamente la validez del formulario**
    - En `src/ui/nickFormState.test.ts`
    - **Validates: Requirements 1.11, 8.3, 8.4, 8.5**

  - [x] 10.3 Implementar el Formulario_Acceso
    - `src/ui/NickForm.tsx`: modos «Ya tengo nick» y «Crear nick» conservando el nick al alternar, texto explicativo del correo siempre visible, «Comprobando…», control «Entrar con ese nick», control de reintento, «Continuar sin nick», aviso «Ranking amistoso: la identidad por nick no está verificada»
    - Accesibilidad: `htmlFor`/`id`, `aria-describedby`, `aria-invalid`, `role="alert"`, foco al primer campo con error, `maxLength` 16 y 254, envío con Enter sin recargar
    - Importa solo de `src/contracts/` y `src/store/`
    - _Requirements: 1.1, 1.6, 1.7, 2.1, 2.2, 2.4, 2.6, 3.3, 8.1, 8.2, 8.3, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 10.5, 12.1, 12.6, 11.5_

  - [x] 10.4 Implementar la puerta de identidad y conectarla al arranque
    - `src/ui/NickGate.tsx`: llama a `bootstrapIdentity()` al montar y elige entre pantalla de carga, `NickForm` o `Dashboard`; la fase de carga no bloquea detección, motor de juego ni escritura de minutos
    - Integrar en `src/App.tsx` envolviendo el `Dashboard`
    - _Requirements: 1.1, 4.2, 12.4, 12.5_

  - [x] 10.5 Implementar el cambio de nick y «Cambiar de usuario»
    - `src/ui/NickSettings.tsx` con el campo precargado con el nick activo y el control de envío, más el control «Cambiar de usuario»; integrado en `src/ui/ControlPanel.tsx`
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.5, 5.6, 5.7_

  - [x] 10.6 Implementar el aviso de sesión sin nick
    - `src/ui/GuestNotice.tsx`: aviso no modal que no captura el foco, con «Elegir nick» y control de cierre, visibilidad como estado local del componente; integrado en `src/ui/Dashboard.tsx`
    - _Requirements: 12.2, 12.8_

  - [x] 10.7 Adaptar el Ranking_Equipo al nick
    - En `src/ui/RankingPanel.tsx`: `buildRanking` deja de mirar `owner`, sustituye el `displayName` ausente, vacío o en blanco por «Anónimo» conservando la posición, recorta a 50 filas y toma `streakDays` del `GameState` solo para la fila propia
    - _Requirements: 7.3, 7.9, 9.4, 10.6, 14.9_

  - [x]* 10.8 Escribir test de propiedad para el ranking
    - **Property 13: El ranking ordena, recorta y anonimiza sin filtrar nada más**
    - En `src/ui/rankingBuild.test.ts`
    - **Validates: Requirements 7.3, 7.9, 9.4, 10.6**

- [x] 11. Retirada del login de Cognito de la interfaz
  - [x] 11.1 Limpiar el arranque
    - En `src/main.tsx`: fuera `Authenticator.Provider` y `@aws-amplify/ui-react/styles.css`, `Amplify.configure` dentro de `try/catch` para que el arranque no dependa de la nube
    - _Requirements: 12.5, 14.7_

  - [x] 11.2 Limpiar el control de sincronización
    - En `src/ui/SyncControl.tsx`: dejar solo «Sincronizar ahora» y el indicador de estado, retirando `Authenticator` y `useAuthenticator`
    - _Requirements: 14.7_

- [x] 12. Privacidad declarada y sustitución de `backend-nube`
  - [x] 12.1 Actualizar `docs/PRIVACY.md`
    - Entrada del Correo_Vinculado con sus cinco puntos y sección única «Limitaciones asumidas del acceso por nick» con las seis declaraciones, cada una con el requisito que la origina y su motivo
    - _Requirements: 9.5, 10.1, 10.2, 10.3, 10.4, 10.7, 10.8, 10.9, 10.10_

  - [x] 12.2 Anotar los criterios sustituidos de `backend-nube`
    - En `.kiro/specs/backend-nube/requirements.md`: anotación «SUSTITUIDO por identidad-nick» en los criterios enumerados, sin tocar ningún otro contenido ni los criterios conservados
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.9, 14.10_

- [x] 13. Checkpoint final - Integración y fronteras
  - Ensure all tests pass, ask the user if questions arise.
  - Comprobar `npm run build` sin errores de tipos y `npm test -- run` sin fallos
  - Comprobar diff vacío en `src/contracts/`, `src/vision/`, `src/posture/`, `src/game/`, `src/feedback/` y `src/pip/`, y cero apariciones de `Authenticator`, `useAuthenticator`, `fetchUserAttributes` y `fetchAuthSession` en `src/`
  - _Requirements: 11.1, 11.2, 11.6, 11.7, 11.8, 14.7, 14.8_

- [x] 14. Comprobación de titularidad en «Ya tengo nick» (incremento posterior)
  - Añadido después de cerrar la tarea 13, a petición del usuario: el acceso concedía el nick a quien lo escribiera, sin ningún otro dato
  - `signIn(rawNick, rawEmail)` resuelto con un único `findByEmail` y comparación del `nickLower` devuelto; sustituir `NICK_NOT_FOUND` por `NICK_EMAIL_MISMATCH`, un solo rechazo para «correo sin identidad» y «identidad con otro nick»
  - Campo de correo en los dos modos del Formulario_Acceso; `canSubmit` pierde el parámetro `mode`; `identityMessageField` gana `'both'`
  - Actualizada la Propiedad 14: el correo viaja ahora también en el acceso, y lo que la propiedad fija es que solo aparece en las operaciones indexadas por correo
  - Declarada en `docs/PRIVACY.md` la limitación 7: la comprobación la resuelve el cliente y las Credenciales_Invitado permiten leer el correo, así que se puede rodear
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10, 2.11, 8.2, 8.5, 9.1, 10.1, 10.10_

## Notes

- Las subtareas marcadas con `*` son opcionales y pueden saltarse para llegar antes a un MVP.
- Las diecisiete propiedades del diseño se ejecutan con Vitest y el generador determinista de `src/storage/__tests__/gen.ts`: sin dependencias npm nuevas y sin reducción automática de contraejemplos (Desviación D4).
- Fuera del alcance de estas tareas, por verificarse a mano: las pruebas de humo contra `npx ampx sandbox`, el recorrido de demo con sus plazos y las comprobaciones de foco, orden de tabulación y contraste del Formulario_Acceso.
- Ninguna tarea modifica `src/contracts/**`: `ActiveIdentity`, `IdentityError` e `IdentityResult` viven en `src/storage/` (Requisito 11 criterio 3).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1", "4.1", "5.1", "12.2"] },
    { "id": 1, "tasks": ["1.2", "2.2", "4.2", "5.2", "10.1", "11.1", "11.2", "12.1"] },
    { "id": 2, "tasks": ["2.3", "4.3", "6.1", "6.4", "10.2", "10.7"] },
    { "id": 3, "tasks": ["2.4", "4.4", "5.3", "6.2", "8.1"] },
    { "id": 4, "tasks": ["4.5", "5.4", "6.3", "6.5", "8.2"] },
    { "id": 5, "tasks": ["6.6", "8.3", "9.1"] },
    { "id": 6, "tasks": ["6.7", "8.4", "9.2"] },
    { "id": 7, "tasks": ["6.8", "8.5", "10.3"] },
    { "id": 8, "tasks": ["6.9", "9.3", "10.4"] },
    { "id": 9, "tasks": ["6.10", "10.5"] },
    { "id": 10, "tasks": ["10.6", "10.8"] }
  ]
}
```
