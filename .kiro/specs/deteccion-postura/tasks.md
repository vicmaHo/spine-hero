# Detección de Postura — Tareas

## Tareas de implementación

- [ ] 1. Crear `fixtures/` con 4 sesiones JSON de landmarks: `session-good.json` (60 s erguido), `session-slouch.json` (erguido 15 s → encorvado), `session-lean.json` (se acerca sin encorvarse), `session-away.json` (erguido 20 s → se levanta).
- [ ] 2. Crear `src/posture/metrics.ts`: funciones `computeMetrics(landmarks, baseline)` y `computeRawMetrics(landmarks)`. Solo usa x, y, visibility. Normaliza por shoulderWidth. Test en `src/posture/__tests__/metrics.test.ts`.
- [ ] 3. Crear `src/posture/scoring.ts`: `computeRawScore(metrics)` con pesos exportados, `applyEma(prev, current, alpha)`. Clamp [0, 100]. Test en `src/posture/__tests__/scoring.test.ts`.
- [ ] 4. Crear `src/posture/stateMachine.ts`: `transition(state, score, confidence, landmarkCount, now)` con constantes de histéresis y debounce exportadas. Test en `src/posture/__tests__/stateMachine.test.ts` cubriendo: GOOD→BAD (8 s), BAD→GOOD (3 s), →LOW_CONF (1 s), →AWAY (5 s), recuperación (2 s), reinicio de contadores.
- [ ] 5. Crear `src/posture/calibration.ts`: `createCalibrationCollector(startTime)` que acumula 5 s, descarta confidence < 0.7, mediana, falla si < 15 frames. Test en `src/posture/__tests__/calibration.test.ts`.
- [ ] 6. Crear `src/posture/pipeline.ts`: `processLandmarks(landmarks, baseline, prevState, prevScore, now)` que orquesta métricas → scoring → stateMachine → PostureFrame. Test en `src/posture/__tests__/pipeline.test.ts`.
- [ ] 7. Crear `src/posture/postureSource.ts`: implementación de `PostureSource` que conecta con el pipeline de visión y gestiona calibración + emisión de PostureFrame.
- [ ] 8. Tests de integración contra los 4 fixtures verificando los criterios de aceptación (CA-1 a CA-4).
- [ ] 9. Verificar que todos los tests pasan y que el build compila sin errores.
