---
inclusion: always
---

# SpineHero — Contratos compartidos

Estos son los tipos que conectan los tres módulos. Son la copia de referencia de
`src/contracts/`.

**Reglas de uso, sin excepciones:**

1. **Usa exclusivamente estos tipos.** No inventes tipos equivalentes, no
   redefinas versiones locales, no uses estructuras anónimas donde exista un
   tipo con nombre.
2. **No los modifiques.** Si necesitas un campo que no existe, **detente y
   avísalo**. Un cambio aquí rompe el código de las otras dos personas del
   equipo sin que se enteren hasta la integración de la tarde.
3. Si un fichero de `src/contracts/` diverge de lo que hay aquí, **el fichero
   real manda** y hay que avisar de que este documento está desactualizado.

---

## `src/contracts/posture.ts`

Produce **V**. Consumen **M** y **C**.

```ts
export type PostureStatus =
  | 'CALIBRATING'
  | 'GOOD'
  | 'BAD'
  | 'AWAY'
  | 'LOW_CONF';

export interface PostureMetrics {
  /** (yHombros - yOrejas) / shoulderWidth. Baja al encorvarse. */
  neckRatio: number;
  /** shoulderWidth actual / shoulderWidth de calibración. >1 = te acercas. */
  proximity: number;
  /** Radianes. Desnivel entre hombros. */
  tilt: number;
  /** Desviación vertical de la nariz respecto al punto medio de las orejas. */
  headTilt: number;
}

export interface CalibrationBaseline {
  shoulderWidth: number;
  neckRatio: number;
  tilt: number;
  headTilt: number;
  capturedAt: number;
}

export interface PostureFrame {
  /** Date.now() del frame de vídeo original. */
  t: number;
  status: PostureStatus;
  /** 0-100, ya suavizado con EMA. */
  score: number;
  metrics: PostureMetrics;
  /** 0-1. Media de visibility de los landmarks clave. */
  confidence: number;
}

export interface PostureSource {
  start(): Promise<void>;
  stop(): void;
  calibrate(): Promise<CalibrationBaseline>;
  /** Devuelve la función para cancelar la suscripción. */
  subscribe(fn: (frame: PostureFrame) => void): () => void;
}

export type PostureError =
  | { kind: 'CAMERA_DENIED' }
  | { kind: 'CAMERA_BUSY' }
  | { kind: 'MODEL_LOAD_FAILED'; detail: string }
  | { kind: 'NO_GPU'; fallback: 'cpu' };
```

> `PostureSource` la implementan **tres** cosas: la fuente real (V), la fuente
> falsa `createMockPostureSource()` (C) y la fuente de replay desde fixtures (V).
> Cualquier código que consuma postura debe depender de la interfaz, nunca de una
> implementación concreta.

---

## `src/contracts/game.ts`

Produce **M**. Consumen **C** (persistencia y UI) y **M** (render).

```ts
export type PetMood = 'idle' | 'happy' | 'sad' | 'faint';

export interface GameState {
  xp: number;
  level: number;
  hp: number;              // 0-100
  flowSeconds: number;     // racha continua actual en GOOD
  goodSecondsToday: number;
  mood: PetMood;
  achievements: string[];
  streakDays: number;
  lastTickAt: number;
}

export type GameEvent =
  | { type: 'XP_GAINED'; amount: number }
  | { type: 'HP_LOST'; amount: number }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'FLOW_MILESTONE'; minutes: number }
  | { type: 'ACHIEVEMENT'; id: string; label: string }
  | { type: 'MOOD_CHANGED'; mood: PetMood }
  | { type: 'FAINTED' }
  | { type: 'REVIVED' };

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

export const INITIAL_GAME_STATE: GameState = {
  xp: 0,
  level: 1,
  hp: 100,
  flowSeconds: 0,
  goodSecondsToday: 0,
  mood: 'idle',
  achievements: [],
  streakDays: 0,
  lastTickAt: 0,
};
```

> La firma del motor es
> `tick(state: GameState, frame: PostureFrame, now: number): TickResult`.
> Es una función **pura**: no lee el reloj por su cuenta, no toca el DOM, no
> reproduce sonidos. Devuelve eventos y otro alguien decide qué hacer con ellos.

---

## `src/contracts/sync.ts`

Produce **C**. Es **lo único que sale del navegador**.

```ts
/** Lo ÚNICO que sale del navegador. Solo enteros agregados. */
export interface Checkpoint {
  date: string;               // YYYY-MM-DD
  goodPostureSeconds: number;
  longestFlowStreak: number;  // minutos
  avgScore: number;           // 0-100
  level: number;
  xp: number;
  teamCode?: string;
}

export interface TeamEntry {
  displayName: string;
  goodPostureSeconds: number;
  level: number;
  streakDays: number;
}
```

> Si en algún momento propones añadir un campo a `Checkpoint` que no sea un
> entero agregado o una cadena corta, párate: probablemente estés a punto de
> romper el diferencial de privacidad del producto.

---

## `src/contracts/worker.ts`

Protocolo entre el hilo principal y el worker de inferencia. Interno de **V**.

```ts
export interface Landmark {
  x: number;
  y: number;
  z: number;          // presente pero NO se usa: ruidoso a distancia de escritorio
  visibility: number;
}

export type ToWorkerMessage =
  | { type: 'INIT'; wasmPath: string; modelPath: string }
  | { type: 'FRAME'; bitmap: ImageBitmap; t: number }
  | { type: 'STOP' };

export type FromWorkerMessage =
  | { type: 'READY' }
  | { type: 'LANDMARKS'; t: number; landmarks: Landmark[]; inferenceMs: number }
  | { type: 'ERROR'; message: string };

/** Índices de MediaPipe Pose que usamos. El resto se descartan. */
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
} as const;
```

> MediaPipe devuelve 33 landmarks. Nosotros usamos **cinco**. Descarta el resto
> lo antes posible en el pipeline: menos datos moviéndose entre hilos y menos
> superficie donde equivocarse de índice.
