# Postura Lateral — Tareas

- [ ] 1. Grabar fixtures laterales con `src/vision/captureSession.ts`:
      `fixtures/session-lateral-good.json` (perfil, erguido) y
      `fixtures/session-lateral-slouch.json` (perfil, erguido 15 s → encorvado).
- [ ] 2. Crear `src/posture/orientation.ts`: `detectOrientation(landmarks, prev, now)`
      con histéresis (umbrales 0.55/0.35, debounce 1 s) reutilizando
      `computeNoseOffset`. Test en `orientation.test.ts`.
- [ ] 3. Crear `src/posture/lateralMetrics.ts`: `visibleSide(landmarks)` y
      `computeNeckAngle(landmarks, side)`. Solo x, y. Test en `lateralMetrics.test.ts`.
- [ ] 4. Modificar `calibration.ts` para soportar una baseline lateral (ángulo
      neutro del cuello), separada de la frontal. Test.
- [ ] 5. Resolver la pregunta abierta de contrato con M y C ANTES del paso 6 si
      se elige la opción (B). Si se elige (A), documentarlo y seguir.
- [ ] 6. Modificar `pipeline.ts` para enrutar a la rama frontal o lateral según
      la orientación detectada; sin baseline lateral en modo LATERAL → CALIBRATING.
      Tests laterales en `pipeline.test.ts`.
- [ ] 7. Tests de integración contra los fixtures laterales (CA-1 a CA-4),
      verificando además que el caso frontal no regresiona.
- [ ] 8. Verificar que toda la suite pasa y que `npm run build` compila sin errores.
