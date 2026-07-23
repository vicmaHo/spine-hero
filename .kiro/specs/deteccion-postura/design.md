# Detección de Postura — Diseño

## Visión general

Pipeline funcional puro que transforma landmarks en PostureFrame:

```
Landmark[5] + CalibrationBaseline + PostureState + prevScore + now
    │
    ▼
  metrics.ts  →  PostureMetrics (4 valores normalizados)
    │
    ▼
  scoring.ts  →  score (0-100, EMA α=0.3)
    │
    ▼
  stateMachine.ts  →  PostureStatus (histéresis + debounce temporal)
    │
    ▼
  PostureFrame { t, status, score, metrics, confidence }
```

---

## Estructura de ficheros

```
src/posture/
├─ metrics.ts          Cálculo de las 4 métricas desde landmarks + baseline
├─ scoring.ts          Score 0-100 ponderado + suavizado EMA
├─ stateMachine.ts     Máquina de estados con histéresis y debounce temporal
├─ calibration.ts      Recolección de frames y cálculo de baseline (mediana)
├─ pipeline.ts         Función orquestadora: landmarks → PostureFrame
├─ postureSource.ts    Implementación de PostureSource que conecta con vision/
├─ __tests__/
│  ├─ metrics.test.ts
│  ├─ scoring.test.ts
│  ├─ stateMachine.test.ts
│  ├─ calibration.test.ts
│  └─ pipeline.test.ts
```

---

## Componentes

### 1. `metrics.ts`

```ts
export function computeMetrics(
  landmarks: Landmark[],
  baseline: CalibrationBaseline,
): PostureMetrics
```

**Cálculos:**
- `shoulderWidth` = |xRightShoulder − xLeftShoulder| (distancia horizontal).
- `midEarsY` = (yLeftEar + yRightEar) / 2.
- `midShouldersY` = (yLeftShoulder + yRightShoulder) / 2.
- `neckRatio` = ((midShouldersY − midEarsY) / shoulderWidth) / baseline.neckRatio.
  Valor ~1 = postura como en calibración. < 1 = encorvado.
- `proximity` = shoulderWidth / baseline.shoulderWidth.
  Valor > 1 = más cerca de la cámara.
- `tilt` = atan2(yRightShoulder − yLeftShoulder, xRightShoulder − xLeftShoulder).
  En radianes, 0 = nivelado.
- `headTilt` = ((yNose − midEarsY) / shoulderWidth) / baseline.headTilt.
  Valor ~1 = cabeza como en calibración.

Nota: Y crece hacia abajo en coordenadas MediaPipe, por lo que `midShouldersY > midEarsY` siempre.

Función auxiliar exportada para calcular métricas crudas (sin normalizar contra baseline), usada durante calibración:

```ts
export function computeRawMetrics(landmarks: Landmark[]): {
  shoulderWidth: number;
  neckRatio: number;
  tilt: number;
  headTilt: number;
}
```

### 2. `scoring.ts`

```ts
export const WEIGHT_NECK_RATIO = 0.40;
export const WEIGHT_TILT = 0.20;
export const WEIGHT_HEAD_TILT = 0.20;
export const WEIGHT_PROXIMITY = 0.20;
export const EMA_ALPHA = 0.3;

export function computeRawScore(metrics: PostureMetrics): number
export function applyEma(prev: number, current: number, alpha?: number): number
```

**Score bruto:**
- Cada métrica se compara contra el valor ideal (1.0 para neckRatio/headTilt/proximity, 0 para tilt).
- La penalización es proporcional a la desviación absoluta, escalada para que desviaciones "normales" no penalicen y desviaciones grandes penalicen mucho.
- Score = 100 − penalizaciónTotal, clamped a [0, 100].

**EMA:** `smoothed = α × current + (1 − α) × prev`.

### 3. `stateMachine.ts`

```ts
// Umbrales de transición (histéresis)
export const THRESHOLD_BAD_ENTER = 60;     // score < 60 → pendiente BAD
export const THRESHOLD_GOOD_ENTER = 75;    // score > 75 → pendiente GOOD
export const MIN_CONFIDENCE = 0.7;

// Duraciones de debounce (ms)
export const DEBOUNCE_BAD_MS = 8000;       // 8 s continuo para GOOD→BAD
export const DEBOUNCE_GOOD_MS = 3000;      // 3 s continuo para BAD→GOOD
export const DEBOUNCE_LOW_CONF_MS = 1000;  // 1 s para entrar en LOW_CONF
export const DEBOUNCE_AWAY_MS = 5000;      // 5 s para entrar en AWAY
export const DEBOUNCE_RECOVER_MS = 2000;   // 2 s para salir de LOW_CONF/AWAY

export interface PostureState {
  status: PostureStatus;
  /** Status estable anterior (GOOD o BAD), para volver tras LOW_CONF/AWAY */
  lastStableStatus: PostureStatus;
  /** Timestamp en que el pending empezó a cumplirse */
  pendingSince: number | null;
  /** Status al que se está tendiendo */
  pendingTarget: PostureStatus | null;
}

export const INITIAL_POSTURE_STATE: PostureState;

export function transition(
  state: PostureState,
  score: number,
  confidence: number,
  landmarkCount: number,
  now: number,
): PostureState
```

**Reglas:**
1. `landmarkCount === 0`: si persiste `DEBOUNCE_AWAY_MS` → `AWAY`.
2. `confidence < MIN_CONFIDENCE`: si persiste `DEBOUNCE_LOW_CONF_MS` → `LOW_CONF`.
3. En `LOW_CONF` o `AWAY`, si señal válida persiste `DEBOUNCE_RECOVER_MS` → vuelve a `lastStableStatus`.
4. `score < THRESHOLD_BAD_ENTER` y status es `GOOD`: si persiste `DEBOUNCE_BAD_MS` → `BAD`.
5. `score > THRESHOLD_GOOD_ENTER` y status es `BAD`: si persiste `DEBOUNCE_GOOD_MS` → `GOOD`.
6. Si la condición se rompe antes del debounce → `pendingSince = null`, `pendingTarget = null`.

### 4. `calibration.ts`

```ts
export const CALIBRATION_DURATION_MS = 5000;
export const MIN_VALID_FRAMES = 15;
export const MIN_CALIBRATION_CONFIDENCE = 0.7;

export interface CalibrationCollector {
  push(landmarks: Landmark[], confidence: number, now: number): void;
  isComplete(now: number): boolean;
  isValid(): boolean;
  compute(): CalibrationBaseline;
  readonly validCount: number;
}

export function createCalibrationCollector(startTime: number): CalibrationCollector
```

- `isComplete(now)`: true si `now − startTime ≥ CALIBRATION_DURATION_MS`.
- `isValid()`: true si `validCount ≥ MIN_VALID_FRAMES`.
- `compute()`: mediana de cada métrica cruda de los frames válidos.

### 5. `pipeline.ts`

```ts
export function processLandmarks(
  landmarks: Landmark[],
  baseline: CalibrationBaseline,
  prevState: PostureState,
  prevScore: number,
  now: number,
): { frame: PostureFrame; nextState: PostureState; smoothedScore: number }
```

Orquesta: confidence → metrics → score → EMA → stateMachine → PostureFrame.

### 6. `postureSource.ts`

Implementa `PostureSource`. Conecta con `CameraSource` (recibe landmarks), gestiona el flujo de calibración y emite `PostureFrame`. Este fichero **sí** tiene estado y efectos (suscripciones), pero la lógica la delega a los módulos puros.

---

## Decisiones de diseño

| Decisión | Justificación |
|---|---|
| Funciones puras sin estado interno | Testeable contra fixtures sin cámara ni navegador |
| Mediana para calibración | Robusta ante outliers durante la calibración |
| Histéresis con umbrales distintos (60/75) | Evita parpadeo GOOD↔BAD en la zona gris |
| Debounce temporal por condición continua | Un bajón de 2 s no te penaliza; reduce falsos positivos |
| Contadores se reinician (no acumulan) | Si te pones bien 1 s y vuelves a encorvar, los 8 s empiezan de 0 |
| proximity no penaliza si neckRatio estable | Acercarse a la pantalla sin encorvarse es legítimo (CA-3) |
| EMA α=0.3 | Suaviza ruido frame-a-frame sin ser demasiado lento |
| Score congela en AWAY | No penalizar al usuario por levantarse |
