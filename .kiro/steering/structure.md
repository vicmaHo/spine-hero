---
inclusion: always
---

# SpineHero — Estructura y fronteras entre módulos

## Mapa de carpetas

```
spinehero/
├─ .kiro/
│  ├─ steering/          contexto para el agente (estos ficheros)
│  ├─ specs/             una spec por persona
│  │  ├─ vision-postura/     → V
│  │  ├─ juego-feedback/     → M
│  │  └─ shell-nube/         → C
│  └─ hooks/             automatizaciones
├─ amplify/              backend Gen 2                            → C
│  ├─ backend.ts
│  ├─ auth/resource.ts
│  └─ data/resource.ts
├─ public/
│  ├─ models/            pose_landmarker_lite.task                → V
│  ├─ wasm/              runtime de MediaPipe                     → V
│  ├─ sprites/           hero.png (256×32, 8 frames)              → M
│  └─ fonts/             Press Start 2P auto-alojada              → M
├─ fixtures/             sesiones de landmarks en JSON            → V
├─ src/
│  ├─ contracts/         tipos compartidos            COMPARTIDO — PROTEGIDO
│  ├─ vision/            cámara, worker, replay, benchmarks       → V
│  ├─ posture/           métricas, calibración, scoring, estados  → V
│  ├─ game/              motor puro: XP, HP, Flow, logros         → M
│  ├─ feedback/          canvas, audio, notificaciones            → M
│  ├─ pip/               ventana Document Picture-in-Picture      → M
│  ├─ storage/           IndexedDB y sincronización               → C
│  ├─ store/             store de Zustand                         → C
│  └─ ui/                dashboard y componentes                  → C
└─ docs/                 ARCHITECTURE, PRIVACY, BENCHMARKS        → C
```

## Propiedad de ficheros

Cada carpeta tiene un dueño único (marcado arriba). **No modifiques ficheros de
otra persona**: propón el cambio en su lugar y déjalo indicado.

`src/contracts/**` es **compartido y protegido**. No lo modifiques nunca por
iniciativa propia. Si necesitas un tipo que no existe, **detente y avísalo** en
lugar de crearlo: cambiar un contrato sin acordarlo rompe silenciosamente el
código de las otras dos personas.

## Dirección de las dependencias

Las flechas indican qué puede importar qué. Cualquier import que vaya en sentido
contrario es un error de arquitectura.

```
contracts/   ← no importa NADA del proyecto
    ↑
    ├── posture/    importa solo contracts
    │       ↑
    │       └── vision/    importa contracts y posture
    │
    ├── game/       importa solo contracts
    │       ↑
    │       └── feedback/  importa contracts y game
    │               ↑
    │               └── pip/  importa contracts, game y feedback
    │
    └── storage/    importa solo contracts
            ↑
            └── store/   importa contracts, storage, posture, vision, game
                    ↑
                    └── ui/   importa contracts y store
```

### Imports prohibidos (los más probables)

| Prohibido | Por qué |
|---|---|
| `game/` → `vision/` o `posture/` | El motor de juego no sabe que existe una cámara. Solo consume `PostureFrame`. |
| `feedback/` → `posture/` | Igual: el feedback reacciona a `GameEvent` y `PostureFrame`, no a métricas crudas. |
| `posture/` → cualquier cosa con DOM | Debe ser testeable en Node sin navegador. |
| `vision/` o `posture/` → `ui/` o `store/` | El pipeline no conoce la interfaz. |
| Cualquier módulo → `fetch` en `vision/`/`posture/` | Rompe el diferencial de privacidad. |

## Pureza obligatoria

Estos módulos deben ser **funciones puras**: mismo input, mismo output, sin DOM,
sin `Date.now()` interno (el tiempo se pasa como parámetro), sin efectos.

- `src/posture/metrics.ts`
- `src/posture/scoring.ts`
- `src/posture/stateMachine.ts`
- `src/posture/calibration.ts`
- `src/game/engine.ts`
- `src/game/achievements.ts`

Es lo que hace posible testearlos contra los fixtures sin cámara ni navegador.
Todo lo que toque DOM, canvas, audio o red vive en `vision/`, `feedback/`,
`pip/`, `storage/` o `ui/`.
