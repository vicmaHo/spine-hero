# Implementation Plan: backend-nube

## Overview

Implementación del backend cloud con AWS Amplify Gen 2 para SpineHero. El enfoque es incremental: primero las funciones puras testeables (checkpointBuilder, streakCalculator), luego la infraestructura Amplify (auth, data, lambda), después el sincronizador del lado cliente, y finalmente la integración con el store y la UI de ranking. Cada paso construye sobre el anterior y termina con cableado completo.

## Tasks

- [x] 1. Funciones puras del lado cliente
  - [x] 1.1 Implementar `src/storage/checkpointBuilder.ts`
    - Crear función `buildCheckpoint(date, minutes, profile, teamCode?)` que agrega `MinuteEntry[]` + `ProfileRecord` en un `Checkpoint`
    - `goodPostureSeconds` = suma de `goodSeconds` de todas las entradas
    - `avgScore` = media aritmética redondeada de `avgScore` de las entradas (0 si no hay entradas)
    - `longestFlowStreak` = `Math.floor(profile.gameState.flowSeconds / 60)` (minutos)
    - `level` y `xp` del `profile.gameState`
    - `teamCode` del parámetro opcional
    - _Requirements: 4.2, 4.5, 8.1_

  - [x]* 1.2 Write property test for checkpointBuilder
    - **Property 3: Checkpoint aggregation invariants**
    - **Validates: Requirements 4.2, 4.5, 6.5, 8.1**
    - Instalar `fast-check` como devDependency
    - Generar arbitrarios para `MinuteEntry[]`, `ProfileRecord` y `teamCode` opcional
    - Verificar que los campos del output coinciden con los invariantes definidos

  - [x] 1.3 Implementar `src/storage/streakCalculator.ts`
    - Crear interfaz `StreakState { currentDays, bestDays, lastActiveDate }`
    - Crear función pura `computeStreakUpdate(existing: StreakState | null, today: string): StreakState`
    - Si `existing === null` → `{ currentDays: 1, bestDays: 1, lastActiveDate: today }`
    - Si `lastActiveDate === today` → no-op, devolver `existing` sin cambios
    - Si `lastActiveDate === yesterday` → incrementar `currentDays`, actualizar `bestDays` si supera
    - Si `lastActiveDate < yesterday` → reset `currentDays = 1`, preservar `bestDays`
    - _Requirements: 3.3, 3.4, 3.5_

  - [x]* 1.4 Write property tests for streakCalculator
    - **Property 1: Streak continuation preserves and updates correctly**
    - **Property 2: Streak reset preserves bestDays**
    - **Validates: Requirements 3.4, 3.5**
    - Generar StreakState con lastActiveDate = yesterday → verificar incremento
    - Generar StreakState con lastActiveDate < yesterday → verificar reset y bestDays intacto

- [x] 2. Infraestructura Amplify Gen 2
  - [x] 2.1 Configurar `amplify/auth/resource.ts`
    - Definir `defineAuth` con `loginWith: { email: true }`
    - Habilitar acceso de invitado (identidades no autenticadas de Cognito)
    - _Requirements: 1.1, 1.2_

  - [x] 2.2 Configurar `amplify/data/resource.ts` con modelos DailyRecord y Streak
    - Modelo `DailyRecord`: campos date, goodPostureSeconds, longestFlowStreak, avgScore, level, xp, teamCode
    - Índice secundario `byTeamCodeAndDate` con partition key `teamCode` y sort key `date`
    - Autorización: `allow.owner()`, `allow.authenticated().to(['read'])`, `allow.guest().to(['read'])`
    - Modelo `Streak`: campos currentDays (default 0), bestDays (default 0), lastActiveDate
    - Autorización Streak: `allow.owner()` exclusivamente
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

  - [x] 2.3 Implementar `amplify/data/anti-cheat-validator.ts`
    - Lambda handler que valida mutaciones de update de DailyRecord
    - Rechazar si `goodPostureSeconds > 86400`
    - Si existe registro previo: calcular incremento vs tiempo transcurrido + 10% margen
    - Si no existe registro previo y `goodPostureSeconds <= 86400`: aceptar
    - Helper para obtener registro existente del mismo owner y fecha desde DynamoDB
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x]* 2.4 Write property test for anti-cheat validator
    - **Property 4: Anti-cheat validation correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
    - Extraer lógica de validación a función pura testeable
    - Generar tuplas `(existingGPS, newGPS, elapsedSeconds)` con fast-check
    - Verificar las cuatro reglas de aceptación/rechazo

  - [x] 2.5 Configurar `amplify/backend.ts`
    - Importar y exportar auth y data resources
    - Adjuntar anti-cheat-validator como handler de mutación de DailyRecord
    - _Requirements: 5.5_

- [x] 3. Checkpoint — Verificar funciones puras
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Sincronizador del lado cliente
  - [x] 4.1 Implementar `src/storage/synchronizer.ts`
    - Crear interfaz `SynchronizerConfig { intervalMs, maxRetries, baseRetryMs }`
    - Crear interfaz `Synchronizer { start(), stop(), syncNow() }`
    - Factory `createSynchronizer(config?)` con defaults: 300_000ms, 3 retries, 1_000ms base
    - Timer con `setInterval` que llama a `syncNow()` cada 300s
    - `syncNow()`: construir Checkpoint desde IndexedDB (getDay + getProfile), enviar vía Amplify client
    - No enviar si `!navigator.onLine` o no hay sesión autenticada
    - Escuchar `window.addEventListener('online', ...)` para sync inmediato al reconectar
    - Retry con backoff exponencial: `baseRetryMs * 2^attempt` (1s → 2s → 4s), máx 3 intentos
    - Tras agotar reintentos: descartar intento, esperar próximo ciclo
    - Tras sync exitoso de DailyRecord: llamar `computeStreakUpdate` y hacer upsert de Streak
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.2_

  - [x]* 4.2 Write unit tests for synchronizer
    - Test con fake timers: verificar que se ejecuta cada 300s
    - Test de retry: verificar backoff exponencial con mock de Amplify client
    - Test de reconnect: simular evento `online` y verificar sync inmediato
    - Test offline: verificar que no envía cuando `navigator.onLine === false`
    - _Requirements: 4.1, 4.3, 4.4, 4.6_

- [x] 5. CSP y seguridad
  - [x] 5.1 Configurar CSP en `amplify/hosting/custom-headers.yml`
    - `default-src 'self'`
    - `script-src 'self' 'unsafe-inline'`
    - `style-src 'self' 'unsafe-inline'`
    - `connect-src 'self' https://*.appsync-api.*.amazonaws.com`
    - `img-src 'self' data:`
    - `media-src 'self'`
    - `font-src 'self'`
    - `form-action 'self'`
    - `frame-ancestors 'none'`
    - Headers COOP y COEP para aislamiento
    - _Requirements: 8.4, 8.5_

- [x] 6. Integración con el store y UI
  - [x] 6.1 Integrar synchronizer en `src/store/useAppStore.ts`
    - Importar `createSynchronizer` en el store
    - Añadir estado de auth: `isAuthenticated`, `teamCode`
    - Crear acción `onAuthReady()` que instancia y arranca el synchronizer
    - Crear acción `onAuthLost()` que detiene el synchronizer
    - El synchronizer es un singleton a nivel de módulo (variable fuera del estado de Zustand)
    - _Requirements: 4.1, 7.1, 7.3_

  - [x] 6.2 Implementar componente de ranking `src/ui/RankingPanel.tsx`
    - Campo de texto para TeamCode (4-20 alfanuméricos, validación en cliente)
    - Consultar `client.models.DailyRecord.listByTeamAndDate` con teamCode y fecha actual
    - Ordenar resultado por `goodPostureSeconds` descendente
    - Renderizar lista con displayName, goodPostureSeconds (formateado HH:MM:SS), level, streakDays
    - Estado vacío: "No se encontraron resultados para este código"
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x]* 6.3 Write property test for ranking sort
    - **Property 5: Ranking ordering invariant**
    - **Validates: Requirements 6.3**
    - Generar arrays de registros con goodPostureSeconds arbitrario
    - Verificar que el sort produce lista en orden descendente

  - [x]* 6.4 Write unit tests for RankingPanel
    - Test empty state: TeamCode inválido muestra error de validación
    - Test sin resultados: muestra mensaje apropiado
    - Test con datos: verifica orden descendente y formato HH:MM:SS
    - _Requirements: 6.1, 6.3, 6.4_

- [x] 7. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- `fast-check` debe instalarse como devDependency antes de ejecutar property tests (tarea 1.2)
- El sincronizador depende de que Amplify esté configurado; si el SDK no carga, la app opera 100% local
- La lógica de anti-cheat se extrae a una función pura para poder testearla sin DynamoDB real

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.5", "5.1"] },
    { "id": 3, "tasks": ["2.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4"] }
  ]
}
```
