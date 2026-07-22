---
inclusion: fileMatch
fileMatchPattern: 'src/vision/**,src/posture/**'
---

# Reglas del módulo de Visión y Postura (V)

## Prohibiciones absolutas

1. **Nunca uses la coordenada `z` de MediaPipe.** Es ruidosa a distancia de
   escritorio. Todo se calcula con `x` e `y`.
2. **Nunca hagas `fetch`, `XMLHttpRequest` ni abras WebSockets** desde estos
   módulos. Cero red. Es un requisito de producto, no una preferencia.
3. **Nunca cargues el modelo ni el WASM desde un CDN.** Siempre
   `/models/pose_landmarker_lite.task` y `/wasm/`, servidos desde `public/`.
4. **Nunca importes desde `src/ui/`, `src/store/`, `src/game/` o
   `src/feedback/`.** Este módulo no sabe que existe una interfaz.

## Normalización

Todas las métricas se normalizan por `shoulderWidth` para ser invariantes a la
distancia del usuario a la cámara. La única excepción deliberada es `proximity`,
que **es** precisamente la razón entre el `shoulderWidth` actual y el de
calibración — ahí la escala es la señal, no el ruido.

```ts
const shoulderWidth = Math.abs(lm[LM.LEFT_SHOULDER].x - lm[LM.RIGHT_SHOULDER].x);
const neckRatio = (shoulderMidY - earMidY) / shoulderWidth;
```

## Calibración

- Acumula 5 segundos de frames.
- **Descarta los frames con `confidence < 0.7`** antes de calcular nada.
- Usa la **mediana, no la media**. La mediana es robusta a los saltos puntuales
  de un landmark; la media no.
- Si tras filtrar quedan menos de 15 frames válidos, la calibración **falla** y
  se pide repetirla. No calibres con datos malos: arrastrarás el error toda la
  sesión.

## Suavizado y umbrales

- EMA con `α = 0.3` sobre el score. Nunca uses el score crudo para decidir
  transiciones de estado.
- Umbrales de la máquina de estados, todos como constantes exportadas:

```ts
export const SCORE_BAD_ENTER = 60;      // por debajo, empieza a contar
export const SCORE_GOOD_ENTER = 75;     // por encima, empieza a contar
export const MS_TO_BAD = 8000;
export const MS_TO_GOOD = 3000;
export const MS_TO_AWAY = 5000;
export const MS_TO_RECOVER = 2000;
export const MIN_CONFIDENCE = 0.7;
export const EMA_ALPHA = 0.3;
```

- **Histéresis obligatoria:** los umbrales de entrada y salida son distintos a
  propósito. Si los igualas, el estado parpadea y la mascota tiembla.
- Los contadores de tiempo **se reinician en cuanto se rompe la condición**. No
  son acumulativos.

## Estados AWAY y LOW_CONF

Son estados de *no información*, no de mala postura. Mientras estén activos, el
sistema **no penaliza al usuario de ninguna forma**. Guarda `previousStable`
para saber a qué estado volver al recuperar la señal.

## Worker

- Un único `PoseLandmarker` reutilizado, creado en `INIT`. Nunca lo recrees por
  frame.
- **`bitmap.close()` siempre en un bloque `finally`.** Es la fuga de memoria más
  fácil de introducir y la más difícil de notar hasta que la pestaña va a 2 FPS.
- Si llega un `FRAME` mientras se procesa otro, **descarta el nuevo** (cerrando
  su bitmap). No encoles.
- Envía el `ImageBitmap` como objeto transferible (segundo argumento de
  `postMessage`), no lo clones.
- Descarta los 28 landmarks que no usamos antes de mandar el mensaje de vuelta.

## Tests

Todo cambio en `metrics.ts`, `scoring.ts` o `stateMachine.ts` debe pasar los
cuatro fixtures antes de darse por terminado:

| Fixture | Qué debe ocurrir |
|---|---|
| `session-good.json` | GOOD todo el rato, sin una sola transición |
| `session-slouch.json` | GOOD → BAD, una única transición |
| `session-away.json` | GOOD → AWAY → GOOD, sin pérdida de HP |
| `session-lean.json` | **GOOD todo el rato.** Acercarse a la pantalla no es encorvarse |

`session-lean` es el que separa un detector usable de uno que da falsos
positivos constantes. Si al afinar los pesos ese test se rompe, el afinado está
mal, no el test.
