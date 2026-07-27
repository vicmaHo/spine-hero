# Postura Lateral — Diseño

## Visión general

Se añade una rama lateral al pipeline de postura. La detección de orientación
decide qué set de métricas aplicar; el scoring y la máquina de estados se
reutilizan sin cambios.

```
Landmark[5] + baselines + PostureState + prevScore + now
    │
    ▼
  orientation.ts → FRONTAL | LATERAL   (noseOffset + histéresis)
    │
    ├── FRONTAL → metrics.ts (actual)        ─┐
    │                                          ├→ score → stateMachine → PostureFrame
    └── LATERAL → lateralMetrics.ts (nuevo)  ─┘
```

---

## Estructura de ficheros

```
src/posture/
├─ orientation.ts        detección FRONTAL/LATERAL (noseOffset + histéresis)
├─ lateralMetrics.ts     ángulo oreja–hombro del lado visible
├─ metrics.ts            (sin cambios) métricas frontales
├─ pipeline.ts           (modificado) enruta a métricas frontal o lateral
├─ calibration.ts        (modificado) soporta baseline lateral
└─ __tests__/
   ├─ orientation.test.ts
   ├─ lateralMetrics.test.ts
   └─ pipeline.test.ts    (casos laterales añadidos)
```

---

## Componentes

### 1. `orientation.ts`

```ts
export const ENTER_LATERAL_NOSE_OFFSET = 0.55;
export const EXIT_LATERAL_NOSE_OFFSET = 0.35;
export const ORIENTATION_DEBOUNCE_MS = 1000;

export type Orientation = 'FRONTAL' | 'LATERAL';

export interface OrientationState {
  orientation: Orientation;
  pendingSince: number | null;
  pendingTarget: Orientation | null;
}

export function detectOrientation(
  landmarks: Landmark[],
  prev: OrientationState,
  now: number,
): OrientationState;
```

Reutiliza `computeNoseOffset` de `metrics.ts`. Histéresis con umbrales de
entrada/salida distintos (0.55 / 0.35) para no parpadear en el ángulo intermedio.

### 2. `lateralMetrics.ts`

```ts
export type Side = 'LEFT' | 'RIGHT';

/** Lado hacia el que mira la nariz (el visible en perfil). */
export function visibleSide(landmarks: Landmark[]): Side;

/** Ángulo del cuello (oreja→hombro) respecto a la vertical, en radianes. */
export function computeNeckAngle(landmarks: Landmark[], side: Side): number;
```

`computeNeckAngle` = `atan2(|earX − shoulderX|, |shoulderY − earY|)` del lado
visible. Solo 2 puntos, sin normalizar por `shoulderWidth`.

### 3. `calibration.ts` (modificado)

Añade una baseline lateral (ángulo neutro del cuello). Se calibra estando de
perfil; se guarda separada de la frontal. El `PostureSource` decide cuál usar
según la orientación detectada.

### 4. `pipeline.ts` (modificado)

```ts
// Pseudocódigo del enrutado
const orientation = detectOrientation(landmarks, prevOrient, now).orientation;
if (orientation === 'LATERAL') {
  if (!lateralBaseline) return frozenFrame(... 'CALIBRATING' ...);
  const angle = computeNeckAngle(landmarks, visibleSide(landmarks));
  const score = scoreFromDeviation(angle, lateralBaseline.neckAngle);
  // misma máquina de estados
} else {
  // rama frontal actual
}
```

---

## Decisiones de diseño

| Decisión | Justificación |
|---|---|
| Ángulo oreja–hombro (no ratios) | Solo necesita 2 puntos; invariante a escala y distancia |
| Baseline lateral aparte | El neutro de perfil ≠ el neutro frontal |
| Reusar scoring y máquina de estados | El cambio es solo la métrica de entrada |
| Histéresis en el cambio de modo | Evita parpadeo FRONTAL↔LATERAL en ~45° |
| Umbral de modo (0.55/0.35) | Empírico: capturas reales daban ~0.15 frontal, ~0.70 lateral |

---

## Pregunta abierta (REQUIERE ACUERDO DE EQUIPO — TOCA CONTRATO)

`PostureMetrics` (#[[file:src/contracts/posture.ts]]) tiene campos frontales
(`neckRatio`, `proximity`, `tilt`, `headTilt`). Dos opciones:

- **(A)** Reutilizar los campos existentes con semántica lateral (menos limpio,
  pero **no cambia el contrato**).
- **(B)** Añadir `orientation` y/o `neckAngle` a `PostureMetrics`/`PostureFrame`
  → **cambio de contrato** que consumen M y C. Debe acordarse con el equipo
  antes de tocarlo.

Recomendación: empezar con (A) para no bloquear; migrar a (B) si M/C necesitan
distinguir el modo en su lado.
