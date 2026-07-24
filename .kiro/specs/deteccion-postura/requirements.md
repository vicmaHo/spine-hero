# Detección de Postura — Requisitos

## Contexto

La spec `pipeline-vision` ya produce landmarks de MediaPipe a 5 FPS. Esta spec los consume y produce el `PostureFrame` definido en #[[file:src/contracts/posture.ts]]. **No toca la cámara ni el worker.**

Los landmarks de entrada son los 5 definidos en #[[file:src/contracts/worker.ts]] (NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER). La coordenada `z` **nunca se usa**.

---

## Requisitos funcionales (notación EARS)

### RF-1 · Calibración

**Cuando** el usuario solicite calibración,
**el sistema** acumulará 5 segundos de frames con el usuario erguido, descartará los que tengan `confidence < 0.7`, y devolverá la **mediana** (no la media) de `shoulderWidth`, `neckRatio`, `headTilt` y `tilt` como `CalibrationBaseline`.

**Si** tras filtrar quedan menos de 15 frames válidos,
**entonces** la calibración falla y se indica que debe repetirse.

### RF-2 · Cálculo de métricas

**Cuando** se reciban landmarks y exista una baseline válida,
**el sistema** calculará las cuatro métricas de `PostureMetrics`, normalizadas por `shoulderWidth` para ser invariantes a la distancia del usuario a la cámara:
- `neckRatio`: (yMidHombros − yMidOrejas) / shoulderWidth actual, dividido por `baseline.neckRatio`.
- `proximity`: shoulderWidth actual / `baseline.shoulderWidth`.
- `tilt`: ángulo en radianes del desnivel entre hombros (atan2).
- `headTilt`: (yNose − yMidOrejas) / shoulderWidth actual, dividido por `baseline.headTilt`.

### RF-3 · Score ponderado con suavizado EMA

**Cuando** se calculen las métricas de un frame,
**el sistema** producirá un score de 0 a 100 como suma ponderada de las desviaciones respecto a la línea base, suavizado con media móvil exponencial de α = 0.3. Los pesos son constantes exportadas:
- `WEIGHT_NECK_RATIO` (encorvamiento, el más importante)
- `WEIGHT_TILT` (hombro caído)
- `WEIGHT_HEAD_TILT` (cabeza ladeada)
- `WEIGHT_PROXIMITY` (distancia a la pantalla)

### RF-4 · Máquina de estados pura con histéresis

**Cuando** se evalúe un frame,
**el sistema** determinará el `PostureStatus` aplicando las siguientes reglas con todos los umbrales como constantes exportadas:

| Transición | Condición | Duración continua requerida |
|---|---|---|
| GOOD → BAD | score < 60 | 8 s |
| BAD → GOOD | score > 75 | 3 s |
| Cualquiera → LOW_CONF | confidence < 0.7 | 1 s |
| Cualquiera → AWAY | sin landmarks válidos | 5 s |
| LOW_CONF/AWAY → estado anterior estable | señal válida | 2 s |

Los contadores se **reinician** al romperse la condición (no son acumulativos). Las duraciones de histéresis son distintas de entrada y salida para evitar parpadeo.

### RF-5 · Producción de PostureFrame

**Cuando** se procese un conjunto de landmarks,
**el sistema** emitirá un `PostureFrame` completo: timestamp original, status resultante de la máquina de estados, score suavizado, métricas calculadas y confidence (media de visibility de los 5 landmarks).

### RF-6 · Implementación de PostureSource

**Cuando** se ensamble el pipeline completo,
**el sistema** proporcionará una implementación de la interfaz `PostureSource` que combine: recepción de landmarks del pipeline de visión → calibración → métricas → scoring → máquina de estados → emisión de PostureFrame a suscriptores.

---

## Requisitos no funcionales

### RNF-1 · Pureza total

`metrics.ts`, `scoring.ts`, `calibration.ts` y `stateMachine.ts` deben ser funciones puras: mismo input, mismo output, sin DOM, sin `Date.now()` (el tiempo entra como parámetro), sin efectos secundarios.

### RNF-2 · Normalización por shoulderWidth

Todas las métricas se normalizan por `shoulderWidth` para ser invariantes a la distancia del usuario a la cámara.

### RNF-3 · Coordenada Z ignorada

Nunca se usa la coordenada `z`. Solo `x`, `y` y `visibility`.

### RNF-4 · Fronteras de importación

`src/posture/` importa únicamente de `src/contracts/`. No importa de `src/vision/`, `src/game/`, `src/ui/`, `src/storage/` ni `src/store/`.

### RNF-5 · Configuración explícita

Todos los umbrales, pesos y constantes se exportan con nombre al inicio del fichero. Nunca números mágicos incrustados en la lógica.

---

## Criterios de aceptación (verificables contra fixtures)

### CA-1 · Postura correcta sostenida

**Dado** el fixture `fixtures/session-good.json` (usuario erguido, 60 s),
**cuando** se procese con una baseline calibrada de los primeros 5 s,
**entonces** el status permanece en `GOOD` al menos el 95% del tiempo y el score medio es ≥ 80.

### CA-2 · Encorvamiento detectado

**Dado** el fixture `fixtures/session-slouch.json` (usuario que se encorva a los 15 s),
**cuando** se procese,
**entonces** el status transita a `BAD` entre los segundos 23 y 25 (15 s + 8 s de histéresis ± tolerancia) y permanece `BAD` hasta el final.

### CA-3 · Acercarse sin encorvarse permanece GOOD

**Dado** el fixture `fixtures/session-lean.json` (usuario que se acerca a la pantalla sin encorvarse),
**cuando** se procese,
**entonces** el status permanece en `GOOD` durante toda la sesión (proximity sube pero neckRatio se mantiene estable).

### CA-4 · Ausencia detectada

**Dado** el fixture `fixtures/session-away.json` (usuario que se levanta a los 20 s),
**cuando** se procese,
**entonces** el status transita a `AWAY` alrededor del segundo 25 (20 s + 5 s de histéresis) y el score se congela (no penaliza mientras está ausente).

---

## Fuera de alcance

- Captura de vídeo e inferencia de landmarks (spec `pipeline-vision`).
- Motor de juego, XP, HP, logros (spec `juego-feedback`).
- Persistencia y sincronización.
- Interfaz de usuario.
