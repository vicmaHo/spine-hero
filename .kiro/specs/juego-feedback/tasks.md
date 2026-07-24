# Tasks: Feedback Audiovisual

## Tarea 1: Constantes y sprite sheet

- [x] Crear `src/feedback/constants.ts` con todas las constantes exportadas (sprite, tinte, HUD, audio, partículas, notificaciones).
- [x] Crear `src/feedback/spriteSheet.ts`: función `loadSpriteSheet()` que carga `/sprites/hero.png` y `drawSprite()` que recorta y dibuja el frame en el canvas a 128×128 (1:1, sin escalado) con `imageSmoothingEnabled = false`.
- [x] Colocar el fichero de fuente `PressStart2P-Regular.ttf` en `public/fonts/`.
- [x] Verificar que el sprite sheet `public/sprites/hero.png` existe (1024×128, 8 frames de 128×128).

Requisitos cubiertos: R1, R2, R7.

## Tarea 2: Renderer principal y tinte

- [x] Crear `src/feedback/renderer.ts` con `createRenderer(opts)` que devuelve `{ start, stop, triggerParticles }`.
- [x] Implementar el bucle `requestAnimationFrame` con alternancia de frames cada 500 ms basada en `performance.now()`.
- [x] Implementar el tinte por mood con `globalCompositeOperation = 'source-atop'` y restauración a `source-over`.
- [x] Cargar la fuente Press Start 2P con `FontFace` API al iniciar el renderer.
- [x] Asegurar que `stop()` cancela el rAF pendiente.

Requisitos cubiertos: R1, R2, R3.

## Tarea 3: HUD (barra de Flow, corazones, nivel/XP)

- [x] Crear `src/feedback/hud.ts` con función `drawHUD(ctx, state)`.
- [x] Dibujar corazones de HP (5 corazones, lleno/medio/vacío) usando la fuente cargada o rects coloreados.
- [x] Dibujar barra de Flow con caracteres de bloque (▓/░).
- [x] Dibujar nivel actual y barra de progreso de XP.
- [x] Integrar `drawHUD` en el bucle de render de `renderer.ts`.

Requisitos cubiertos: R4, R5, R6, R7.

## Tarea 4: Sistema de partículas

- [x] Crear `src/feedback/particles.ts` con `createParticleSystem()` que expone `{ emit, update, draw, isActive }`.
- [x] Implementar emisión de ≥8 partículas con velocidades aleatorias en abanico.
- [x] Implementar actualización con gravedad suave y decaimiento de `life` (duración ≤ 1 s).
- [x] Implementar dibujado de rects pequeños con opacidad proporcional a `life`.
- [x] Integrar el sistema de partículas en el bucle de render y conectar `triggerParticles()`.

Requisitos cubiertos: R15.

## Tarea 5: Sintetizador 8-bit

- [x] Crear `src/feedback/synth.ts` con `initAudio()`, `playSound()`, `setMuted()`, `isMuted()`.
- [x] Implementar creación perezosa del `AudioContext` en el primer gesto del usuario (click/keydown).
- [x] Implementar `GainNode` maestro para mute global.
- [x] Implementar envolvente ADSR parametrizada desde `constants.ts`.
- [x] Implementar los 4 sonidos: `LEVEL_UP` (arpegio ascendente), `HP_LOST` (glissando descendente), `FLOW_MILESTONE` (arpegio rápido), `ACHIEVEMENT` (fanfarria).

Requisitos cubiertos: R8, R9, R10, R11, R12, R13.

## Tarea 6: Notificaciones de hito inminente

- [x] Crear `src/feedback/notifications.ts` con `requestNotificationPermission()` y `checkAndNotifyFlowMilestone()`.
- [x] Implementar lógica de disparo cuando `flowSeconds >= nextMilestone - 120` y no se haya notificado ya ese hito.
- [x] Gestionar el flag de "ya notificado" para evitar duplicados dentro de la misma racha.

Requisitos cubiertos: R14.

## Tarea 7: Tests

- [x] Crear `src/feedback/particles.test.ts`: verificar que `emit()` genera partículas, `update()` las mueve, y tras 1 s no quedan activas.
- [x] Crear `src/feedback/synth.test.ts`: verificar que `playSound` no lanza sin AudioContext, y que `setMuted` alterna el gain.
- [x] Crear `src/feedback/notifications.test.ts`: verificar lógica de hito inminente (dispara a tiempo, no repite, no dispara fuera de rango).
