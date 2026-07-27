# Spec: Feedback Audiovisual

## Contexto
 
Capa de presentación de SpineHero. Convierte `PostureFrame` y `GameEvent` (de `src/contracts/`) en salida visual y sonora para el usuario. No conoce la cámara ni el pipeline de visión; solo consume datos ya procesados.

Dependencias explícitas de otras specs:
- **motor-juego** → provee `GameState`, `GameEvent` y `TickResult`.
- **ventana-flotante** → aloja el canvas donde este módulo renderiza.

Este módulo vive en `src/feedback/`.

---

## Requisitos funcionales (notación EARS)

### R1 — Render pixel-art del héroe

**While** el canvas está visible,
**when** `GameState.mood` cambia,
**the system shall** seleccionar el par de frames correspondiente del sprite sheet (`/public/sprites/hero.png`, 1024×128, 8 frames de 128×128) según el mapeo:
- `idle` → frames 0-1
- `happy` → frames 2-3
- `sad` → frames 4-5
- `faint` → frames 6-7

y alternar entre los dos frames del mood activo cada 500 ms.

### R2 — Render pixel-perfect

**While** el canvas está montado,
**the system shall** renderizar el sprite a escala ×1 (128×128 px nativos, sin reescalado) con `imageSmoothingEnabled = false` y CSS `image-rendering: pixelated`, de modo que los píxeles del sprite se muestren nítidos sin interpolación.

### R3 — Tinte por mood

**While** se renderiza un frame del héroe,
**the system shall** aplicar un tinte global usando `globalCompositeOperation` según el mood:
- `idle` → sin tinte (colores originales)
- `happy` → tinte dorado suave
- `sad` → tinte azul frío
- `faint` → desaturación (gris)

### R4 — HUD: barra de Flow

**While** el canvas está visible,
**the system shall** mostrar una barra de progreso de Flow usando caracteres de bloque Unicode (▓/░) con la fuente Press Start 2P auto-alojada desde `/public/fonts/`, representando `GameState.flowSeconds` relativo al próximo hito.

### R5 — HUD: corazones de HP

**While** el canvas está visible,
**the system shall** renderizar el HP (`GameState.hp`, 0-100) como una fila de corazones discretos (5 corazones = 100 HP, cada uno representa 20 HP), diferenciando lleno, medio y vacío.

### R6 — HUD: nivel y XP

**While** el canvas está visible,
**the system shall** mostrar el nivel actual (`GameState.level`) y una barra de progreso de XP hacia el siguiente nivel, usando la fuente Press Start 2P.

### R7 — Fuente auto-alojada

**When** el módulo necesita renderizar texto en el canvas,
**the system shall** cargar la fuente Press Start 2P exclusivamente desde `/public/fonts/`. Nunca se realizará una petición a Google Fonts ni a ningún CDN externo.

### R8 — Sonido: subida de nivel

**When** se recibe un `GameEvent` de tipo `LEVEL_UP`,
**the system shall** reproducir un sonido ascendente 8-bit sintetizado con un `OscillatorNode` de tipo square y envolvente ADSR corta.

### R9 — Sonido: pérdida de HP

**When** se recibe un `GameEvent` de tipo `HP_LOST`,
**the system shall** reproducir un sonido descendente 8-bit sintetizado con un `OscillatorNode` de tipo square y envolvente ADSR corta.

### R10 — Sonido: hito de Flow

**When** se recibe un `GameEvent` de tipo `FLOW_MILESTONE`,
**the system shall** reproducir un sonido de celebración 8-bit (arpegio ascendente) sintetizado con Web Audio API.

### R11 — Sonido: logro conseguido

**When** se recibe un `GameEvent` de tipo `ACHIEVEMENT`,
**the system shall** reproducir una fanfarria corta 8-bit sintetizada con Web Audio API, diferenciada del sonido de hito de Flow.

### R12 — AudioContext perezoso

**When** el usuario realiza su primer gesto de interacción (click o tecla),
**the system shall** crear el `AudioContext`. Antes de ese momento, no se instancia ningún contexto de audio (cumplimiento de autoplay policy).

### R13 — Gain maestro (mute)

**While** el `AudioContext` está activo,
**the system shall** enrutar todo el audio a través de un único `GainNode` maestro que permita silenciar/des-silenciar toda la salida de audio sin destruir el contexto.

### R14 — Notificación de hito inminente

**When** `GameState.flowSeconds` alcanza (hito objetivo − 120 segundos),
**the system shall** enviar una notificación del sistema vía `Notification API` indicando que faltan 2 minutos para el hito de Flow, siempre que el usuario haya concedido permiso previamente.

### R15 — Partículas al recuperar buena postura

**When** `PostureFrame.status` transiciona de `BAD` a `GOOD`,
**the system shall** emitir un estallido de partículas en el canvas (mínimo 8 partículas, duración ≤ 1 s, sin librerías externas) como refuerzo positivo visual.

---

## Requisitos no funcionales

### RNF1 — Sin ficheros de audio

El sistema no utilizará ficheros de audio (mp3, wav, ogg). Todo sonido se sintetiza en tiempo real con Web Audio API.

### RNF2 — Sin dependencias gráficas externas

El render se realiza con Canvas 2D nativo. No se permite PixiJS, Three.js ni ningún motor gráfico.

### RNF3 — Aislamiento del pipeline de visión

`src/feedback/` no importará nada de `src/vision/` ni `src/posture/`. Solo consume tipos de `src/contracts/` y datos de `src/game/`.

### RNF4 — Rendimiento del render

El bucle de animación no debe bloquear el hilo principal más de 4 ms por frame a 60 FPS en un equipo de desarrollo típico.

### RNF5 — Cero peticiones de red

Ningún fichero dentro de `src/feedback/` realizará `fetch`, `XMLHttpRequest` ni ninguna petición de red.
