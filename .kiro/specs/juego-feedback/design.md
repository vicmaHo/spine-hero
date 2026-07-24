# Design: Feedback Audiovisual

## Arquitectura de ficheros

```
src/feedback/
├─ renderer.ts          Bucle de render del canvas (sprite + HUD + partículas)
├─ spriteSheet.ts       Carga y recorte del sprite sheet
├─ hud.ts               Dibujado de barra de Flow, corazones, nivel/XP
├─ particles.ts         Sistema de partículas simple
├─ synth.ts             Sintetizador 8-bit (AudioContext + osciladores)
├─ notifications.ts     Wrapper de Notification API para hitos inminentes
└─ constants.ts         Constantes de configuración exportadas
```

---

## Módulo: `spriteSheet.ts`

Responsabilidad: cargar `/public/sprites/hero.png` y exponer una función para dibujar el frame correcto.

```ts
// Constantes del sprite sheet
export const SPRITE_SIZE = 128;       // cada frame es 128×128
export const SPRITE_COLS = 8;         // 8 frames en fila
export const SHEET_WIDTH = 1024;      // 1024×128 total
export const RENDERED_SIZE = 128;     // se renderiza 1:1, sin escalado

// Mapeo mood → índice base del par de frames
export const MOOD_FRAME_MAP: Record<PetMood, [number, number]> = {
  idle:  [0, 1],
  happy: [2, 3],
  sad:   [4, 5],
  faint: [6, 7],
};

export function loadSpriteSheet(): Promise<HTMLImageElement>;
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  frameIndex: number,
  x: number,
  y: number,
): void;
```

`drawSprite` usa `ctx.drawImage` con los parámetros de recorte del source rect (`frameIndex * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE`) y destino de 128×128 (1:1, sin reescalado).

---

## Módulo: `renderer.ts`

Responsabilidad: orquestar el bucle `requestAnimationFrame`, gestionar la alternancia de frames y componer las capas (sprite → tinte → HUD → partículas).

### Ciclo de render

```
requestAnimationFrame →
  1. Limpiar canvas
  2. Determinar frame de animación (toggle cada 500 ms)
  3. Dibujar sprite base
  4. Aplicar tinte con globalCompositeOperation
  5. Dibujar HUD (hud.ts)
  6. Actualizar y dibujar partículas (particles.ts)
```

### Tinte por mood

Técnica: después de dibujar el sprite, se usa `globalCompositeOperation = 'source-atop'` para pintar un `fillRect` semitransparente del color del mood solo sobre los píxeles ya dibujados. Colores:

| Mood | Color | Opacidad |
|------|-------|----------|
| idle | — | 0 (sin tinte) |
| happy | `#FFD700` | 0.15 |
| sad | `#4488CC` | 0.2 |
| faint | `#888888` | 0.35 |

Tras el tinte se restaura `globalCompositeOperation = 'source-over'` para las capas superiores.

### API pública

```ts
export interface RendererOptions {
  canvas: HTMLCanvasElement;
  getState: () => GameState;
  getLastFrame: () => PostureFrame | null;
}

export function createRenderer(opts: RendererOptions): {
  start: () => void;
  stop: () => void;
  triggerParticles: () => void;
};
```

`start()` inicia el rAF loop. `stop()` lo cancela y limpia. `triggerParticles()` se invoca externamente cuando se detecta transición BAD→GOOD.

---

## Módulo: `hud.ts`

Responsabilidad: dibujar la capa de interfaz sobre el canvas.

### Layout (canvas de 128×160 px lógicos: 128 ancho × sprite 128 + HUD 32 abajo)

```
┌────────────────────────┐
│                        │
│     Sprite 128×128     │
│                        │
├────────────────────────┤
│ ♥♥♥♥♥  Lv.3    ░░░▓▓▓ │  ← HUD 32px alto
└────────────────────────┘
```

- **Corazones**: 5 corazones. Cada uno = 20 HP. Se dibujan con `fillText` usando caracteres Unicode (♥ lleno, ♡ vacío) o rects coloreados.
- **Nivel**: texto "Lv.{n}" con la fuente Press Start 2P a 8px.
- **Barra de Flow**: caracteres de bloque (▓ = progreso, ░ = restante) renderizados con `fillText`.
- **Barra de XP**: barra fina de 2px de alto debajo del nivel.

### Carga de fuente

```ts
// Se carga con FontFace API al iniciar el renderer
const font = new FontFace('PressStart2P', 'url(/fonts/PressStart2P-Regular.ttf)');
await font.load();
document.fonts.add(font);
```

---

## Módulo: `particles.ts`

Responsabilidad: sistema de partículas ligero para el efecto de recuperación de postura.

### Diseño

```ts
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;    // 0-1, decrece con el tiempo
  color: string;
  size: number;
}

export function createParticleSystem(): {
  emit: (cx: number, cy: number, count: number) => void;
  update: (dt: number) => void;
  draw: (ctx: CanvasRenderingContext2D) => void;
  isActive: () => boolean;
};
```

- `emit()` genera `count` partículas (≥8) con velocidades aleatorias en abanico desde el centro del sprite.
- `update()` mueve partículas, aplica gravedad suave y reduce `life`.
- `draw()` pinta rects pequeños (2-4px) con opacidad proporcional a `life`.
- Duración total ≤ 1 s (las partículas mueren cuando `life ≤ 0`).
- Colores: paleta pixel-art (dorado, verde, blanco).

---

## Módulo: `synth.ts`

Responsabilidad: sintetizar los 4 efectos sonoros con Web Audio API.

### Arquitectura de audio

```
OscillatorNode (square) → GainNode (envolvente ADSR) → masterGain → destination
```

### AudioContext perezoso

```ts
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

export function ensureAudioContext(): AudioContext { ... }
// Se llama en el primer gesto del usuario (click/keydown)
```

### Envolvente ADSR

Parámetros base (ajustables en `constants.ts`):

| Param | Valor |
|-------|-------|
| Attack | 10 ms |
| Decay | 50 ms |
| Sustain | 0.3 |
| Release | 100 ms |

### Sonidos

| Evento | Diseño sonoro |
|--------|---------------|
| `LEVEL_UP` | Arpegio ascendente: C5→E5→G5→C6, 80 ms por nota |
| `HP_LOST` | Glissando descendente: A4→D4, 200 ms |
| `FLOW_MILESTONE` | Arpegio rápido: C5→E5→G5→C6→E6, 60 ms por nota |
| `ACHIEVEMENT` | Fanfarria: G4→C5→E5→G5 con duración mayor (120 ms por nota) y sustain más alto |

### API pública

```ts
export function initAudio(): void;  // Registra listener de primer gesto
export function playSound(event: GameEvent['type']): void;
export function setMuted(muted: boolean): void;
export function isMuted(): boolean;
```

---

## Módulo: `notifications.ts`

Responsabilidad: enviar notificaciones del sistema para hitos inminentes.

```ts
export const FLOW_NOTIFY_AHEAD_SECONDS = 120; // 2 minutos antes del hito

export function requestNotificationPermission(): Promise<NotificationPermission>;

export function checkAndNotifyFlowMilestone(
  flowSeconds: number,
  nextMilestoneSeconds: number,
  alreadyNotified: boolean,
): boolean;  // Devuelve true si se envió la notificación
```

Hitos de Flow definidos en `constants.ts` (e.g., 5, 15, 30, 60 minutos). Cuando `flowSeconds >= nextMilestone - 120` y no se ha notificado ya para ese hito, se dispara la notificación.

---

## Módulo: `constants.ts`

Todas las constantes configurables del módulo de feedback en un solo lugar:

```ts
// Sprite
export const SPRITE_SIZE = 128;
export const SPRITE_SCALE = 1;        // sin escalado, el frame ya es 128×128
export const FRAME_TOGGLE_MS = 500;

// Tinte
export const MOOD_TINT: Record<PetMood, { color: string; alpha: number }> = { ... };

// HUD
export const HUD_HEIGHT = 32;
export const HEARTS_COUNT = 5;
export const HP_PER_HEART = 20;

// Audio
export const ADSR = { attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.1 };
export const MASTER_VOLUME = 0.4;

// Partículas
export const PARTICLE_COUNT = 12;
export const PARTICLE_LIFETIME = 1.0; // segundos
export const PARTICLE_GRAVITY = 120;  // px/s²

// Notificaciones
export const FLOW_MILESTONES = [5 * 60, 15 * 60, 30 * 60, 60 * 60]; // en segundos
export const FLOW_NOTIFY_AHEAD = 120; // segundos antes del hito
```

---

## Flujo de datos

```
store (Zustand)
  │
  ├─ subscribe(GameEvent[]) ──→ synth.playSound()
  │                           ──→ notifications.checkAndNotify()
  │
  ├─ subscribe(PostureFrame) ──→ detectar transición BAD→GOOD → renderer.triggerParticles()
  │
  └─ getState() ──→ renderer lee GameState en cada frame de rAF
```

El componente React que monta el canvas se encarga de:
1. Crear el `<canvas>` con dimensiones fijas.
2. Llamar a `createRenderer()` y `start()`.
3. Suscribirse a los eventos del store para disparar sonidos y partículas.
4. Limpiar todo en el `useEffect` cleanup.

---

## Restricciones de diseño

- **Dirección de imports**: `feedback/` importa de `contracts/` y de `game/` (para constantes de XP por nivel si las necesita). No importa de `vision/`, `posture/`, `store/` ni `ui/`.
- **Canvas fijo**: el tamaño del canvas es fijo (128×160 lógicos: sprite 128×128 + HUD 32px). La ventana flotante (spec aparte) decide su tamaño; este módulo no se adapta dinámicamente.
- **Sin estado global**: todo el estado del renderer vive dentro del closure de `createRenderer`. No hay singletons.
- **Limpieza explícita**: `stop()` cancela el rAF, cierra el AudioContext si existe, y vacía las partículas.
