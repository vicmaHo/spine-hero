# Postura Lateral — Tareas

> **Decisiones tomadas para ejecución autónoma:**
> - **Contrato → opción (A):** reusar los campos de `PostureMetrics` con semántica
>   lateral. **NO tocar `src/contracts/` (protegido).** Aguas abajo M y C consumen
>   `status` y `score`, no los campos crudos, así que es seguro.
> - **Fixtures → sintéticos** (como los frontales existentes en `fixtures/generate.ts`),
>   sin webcam. La validación contra grabación real de perfil queda como
>   follow-up opcional (tarea 9), no bloquea la ejecución.
> - Detector de orientación ya medido con datos reales: `noseOffset` ~0.15
>   frontal / ~0.70 lateral; umbrales 0.55/0.35 con histéresis.

- [ ] 1. Extender `fixtures/generate.ts` para generar fixtures laterales
      SINTÉTICOS: `session-lateral-good.json` (perfil, erguido) y
      `session-lateral-slouch.json` (perfil, erguido 15 s → encorvado). Modelar
      el perfil con orejas casi alineadas en x (noseOffset alto) y el ángulo
      oreja→hombro creciendo en el slouch. Regenerar con `npx tsx fixtures/generate.ts`.
- [ ] 2. Crear `src/posture/orientation.ts`: `detectOrientation(landmarks, prev, now)`
      con histéresis (umbrales 0.55/0.35, debounce 1 s) reutilizando
      `computeNoseOffset`. Test en `orientation.test.ts`.
- [ ] 3. Crear `src/posture/lateralMetrics.ts`: `visibleSide(landmarks)` y
      `computeNeckAngle(landmarks, side)`. Solo x, y. Test en `lateralMetrics.test.ts`.
- [ ] 4. Modificar `calibration.ts` para soportar una baseline lateral (ángulo
      neutro del cuello), separada de la frontal. Test.
- [ ] 5. Contrato: aplicar la opción (A) ya decidida — reusar campos de
      `PostureMetrics` con semántica lateral. No modificar `src/contracts/`.
      (Sin bloqueo de equipo; decisión ya tomada.)
- [ ] 6. Modificar `pipeline.ts` para enrutar a la rama frontal o lateral según
      la orientación detectada; sin baseline lateral en modo LATERAL → CALIBRATING.
      Tests laterales en `pipeline.test.ts`.
- [ ] 7. Tests de integración contra los fixtures laterales (CA-1 a CA-4),
      verificando además que el caso frontal NO regresiona (session-good.json).
- [ ] 8. Verificar que toda la suite pasa (`npx vitest run`) y que `npm run build`
      compila sin errores.
- [ ] 9. (Opcional, follow-up) Validar contra grabación real de perfil con
      `captureSession.ts` y ajustar umbrales si hace falta.
