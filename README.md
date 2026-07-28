<p align="center">
  <img src="src/assets/principal.png" alt="La mascota de SpineHero" width="620">
</p>

<h1 align="center">SpineHero</h1>

<p align="center">
  Tu postura, medida por la webcam, convertida en la vida de un tamagotchi pixel-art<br>
  que vive en una ventana flotante siempre encima de lo que estés haciendo.<br>
  El vídeo se procesa entero en tu navegador y no sale a internet.
</p>

<p align="center">
  <a href="https://spinehero.online"><b>▸ spinehero.online</b></a>
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca">
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178c6">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646cff">
  <img alt="MediaPipe" src="https://img.shields.io/badge/MediaPipe-tasks--vision-00897b">
  <img alt="AWS Amplify Gen 2" src="https://img.shields.io/badge/AWS-Amplify%20Gen%202-ff9900">
  <img alt="Licencia Apache 2.0" src="https://img.shields.io/badge/licencia-Apache%202.0-blue">
</p>

---

## Pruébalo

**[spinehero.online](https://spinehero.online)** — no hace falta instalar nada.
Necesitas Chrome o Edge de escritorio (versión 116 o superior) y dar permiso de
cámara. El flujo es: eliges un nick, pulsas **Iniciar**, te sientas erguido y
pulsas **Calibrar** (5 segundos), y luego **Abrir ventana flotante** para sacar
la mascota encima del resto de ventanas. La propia ventana flotante lleva su
botón de calibrar, así que no hace falta volver a la pestaña para reajustar la
línea base.

El vídeo de la cámara no sale del navegador: el modelo de visión se carga desde
la propia página y la inferencia ocurre en tu equipo. Lo que se envía a la nube
son unos pocos números agregados al día, y solo si eliges un nick.

## El problema

Quien pasa ocho o diez horas al día delante de una pantalla casi nunca está
mirando la pestaña de la aplicación que le vigila la espalda: está en su editor,
en una hoja de cálculo o en una videollamada. Un aviso que exija cambiar de
pestaña para verlo es un aviso que no se ve.

SpineHero parte de ahí. Mide la postura con la webcam, procesa todo en el
navegador y saca el resultado a una ventana flotante que se queda por encima de
cualquier otra ventana mientras siga abierta, sin importar en qué estés
trabajando.

## Los cuatro pilares

| | |
|---|---|
| **Ventana flotante siempre visible** | `Document Picture-in-Picture API`, con fallback a `window.open()` donde no está disponible. La ventana se abre a 220×302 px manteniendo la proporción del canvas, y el tamaño que le dejes se conserva. |
| **Procesamiento local** | El modelo y el runtime WASM se sirven desde `/public`, la tipografía está auto-alojada y el pipeline de detección no hace ninguna petición de red. La CSP de producción limita `connect-src` al propio origen y al endpoint de AppSync. |
| **Calibración personal e histéresis** | Sin ángulos absolutos: ratios normalizados contra la línea base del propio usuario, con umbrales distintos de entrada y de salida para que el estado no oscile. |
| **Presupuesto de cómputo acotado** | Inferencia en un Web Worker, limitada a 5 FPS, con descarte de frames si el worker sigue ocupado. `PerfStats` mide p50, p95, FPS reales y frames descartados sobre una ventana deslizante de 100 muestras. |

## Cómo funciona

```
 webcam ──► <video> ──► createImageBitmap ──► Web Worker (módulo)
                             │                      │
                     throttle a 5 FPS         PoseLandmarker lite
                     descarta si ocupado        delegate: GPU
                             │                      │
                             ▼                      ▼
                        contracts/worker      33 landmarks → nos quedamos 5
                                                     │
   ┌─────────────────────────────────────────────────┘
   ▼
 posture/  métricas 2D normalizadas ──► score EMA ──► máquina de estados
   │                                                        │
   ▼                                                        ▼
 PostureFrame ────────────────────────────────► game/  XP · HP · Flow · logros
                                                            │
                                          ┌─────────────────┴──────────────────┐
                                          ▼                                    ▼
                              feedback/  canvas 2D                    storage/  IndexedDB
                              sonido 8-bit, notificaciones                      │
                                          │                              agregados diarios
                                          ▼                                     ▼
                                    pip/  ventana flotante              AppSync → DynamoDB
```

### Del píxel a la métrica

De los 33 landmarks que devuelve MediaPipe se usan **cinco**: nariz, ambas
orejas y ambos hombros. El resto se descarta en el worker, así cruza menos dato
entre hilos.

La coordenada `z` no se usa. A distancia de escritorio (unos 50 cm) resulta
demasiado ruidosa, así que todo se calcula con ratios 2D normalizados por el
ancho de hombros, lo que hace las métricas invariantes a la distancia a la
cámara.

| Métrica | Qué mide | Peso en el score |
|---|---|---|
| `neckRatio` | `(yHombros − yOrejas) / anchoHombros`. Baja al encorvarse. | 40 % |
| `tilt` | Desnivel entre hombros, en radianes. | 20 % |
| `headTilt` | Desviación vertical de la nariz respecto al punto medio de las orejas. | 20 % |
| `proximity` | Ancho de hombros actual frente al de calibración. `>1` = te has acercado. | 20 % |

Cada métrica se penaliza de forma cuadrática, con una zona muerta de 0,05 para
tolerar el ruido, y el resultado se suaviza con una media móvil exponencial
(`alpha = 0.4`, unos 1,3 s de respuesta a 5 FPS).

Hay además un detector de orientación (`computeNoseOffset`): al girar la cabeza,
las orejas se juntan en `x` y la nariz se descentra. Sirve para saber cuándo las
métricas 2D dejan de ser fiables, porque de perfil MediaPipe inventa el lado
ocluido de forma estable y la `visibility` no lo delata.

### Calibración

Cinco segundos mirando al frente en tu postura habitual. Se toma la **mediana**
de los frames válidos (mínimo 15, con confianza ≥ 0,7) y eso queda como línea
base. A partir de ahí la medida es contra ti mismo, no contra un ideal
anatómico.

### Estados con histéresis

Los umbrales de entrada y de salida son distintos a propósito, y cada transición
exige que la condición se mantenga un tiempo mínimo.

| Transición | Condición | Tiempo sostenido |
|---|---|---|
| `GOOD → BAD` | score < 60 | 8 s |
| `BAD → GOOD` | score > 75 | 3 s |
| `→ LOW_CONF` | confianza < 0,7 | 1 s |
| `→ AWAY` | sin landmarks | 5 s |
| Recuperación | señal válida de nuevo | 2 s |

## El bucle de juego

<table>
  <tr>
    <td align="center" width="33%"><img src="src/assets/feliz.png" alt="Mascota contenta" width="240"></td>
    <td align="center" width="33%"><img src="src/assets/triste.png" alt="Mascota marchita" width="240"></td>
    <td align="center" width="33%"><img src="src/assets/ausente.png" alt="Mascota en pausa" width="240"></td>
  </tr>
  <tr>
    <td align="center"><b>Buena postura</b><br>Sube la XP y la barra de Flow,<br>el HP se regenera.</td>
    <td align="center"><b>Mala postura</b><br>Baja el HP, la mascota se marchita,<br>suenan dos notas descendentes.</td>
    <td align="center"><b>Ausente</b><br>Todo se congela. Levantarse<br>no penaliza.</td>
  </tr>
</table>

El motor (`src/game/engine.ts`) es una función pura
`tick(state, frame, now) → { state, events }`. No lee el reloj, no toca el DOM y
no reproduce sonidos: devuelve eventos y otra capa decide qué hacer con ellos.

- **XP:** 10 puntos por cada minuto acumulado en buena postura.
- **Nivel:** umbral acumulado `100 × nivel^1.5` (100, 282, 519, 800…).
- **HP:** −5 al entrar en mala postura, −1 por cada 10 s que sigas así,
  +0,5/s mientras la postura sea buena.
- **Desmayo:** a 0 HP la mascota cae. Vuelve con 20 HP tras 5 minutos de Flow
  continuado.
- **Logros:** Espalda de Acero (25 min de Flow), Lord del Clean Code (90 min),
  Constante (3 días de racha).

El avatar se dibuja en Canvas 2D desde un sprite sheet de 8 frames de 128×128
(dos por estado de ánimo, alternando cada 500 ms) con un tinte por estado y
`imageSmoothingEnabled = false`. Debajo hay una franja de HUD de 48 px con cinco
corazones (20 HP cada uno), nivel, Flow, barra de XP y el score de postura en
diez segmentos.

El audio se genera en tiempo real con la Web Audio API: onda cuadrada,
envolvente ADSR y un filtro paso bajo a 1200 Hz que le quita lo estridente sin
perder el carácter 8-bit. Hay cuatro sonidos (subida de nivel, pérdida de vida,
hito de Flow y logro) y ni un fichero de audio en el repositorio. Si concedes
permiso de notificaciones, avisa dos minutos antes del siguiente hito de Flow.

## Privacidad

Lo único que sale del navegador son enteros agregados por día:

```ts
interface Checkpoint {
  date: string;               // YYYY-MM-DD
  goodPostureSeconds: number;
  longestFlowStreak: number;  // minutos
  avgScore: number;           // 0-100
  level: number;
  xp: number;
  teamCode?: string;
}
```

Lo que no sale: frames de vídeo, `ImageBitmap`, datos de píxeles, arrays de
landmarks, coordenadas de pose ni métricas por frame. Aparte del `Checkpoint`,
al alta se envía el nick y un correo, cuya única función es limitar a un nick por
persona; el correo no aparece en el ranking ni se escribe en IndexedDB.

No hay procesamiento en servidor, ni telemetría, ni analítica de terceros, ni
fuentes remotas: la tipografía Press Start 2P está en `public/fonts/`, y el
modelo `pose_landmarker_lite.task` y el runtime WASM en `public/models/` y
`public/wasm/`. La CSP la aplica Amplify Hosting como cabecera de respuesta
([`amplify/hosting/custom-headers.yml`](amplify/hosting/custom-headers.yml)) y
deja `connect-src` en dos orígenes: el propio y el endpoint de AppSync.

El detalle completo, incluido qué se guarda en local y qué campos viajan en cada
operación, está en [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Stack

| Capa | Tecnología |
|---|---|
| Build | Vite 8 + React 19 + TypeScript en modo `strict` |
| Estilos | Tailwind CSS v4 vía `@tailwindcss/vite` |
| Estado | Zustand, un único store |
| Visión | `@mediapipe/tasks-vision` → `PoseLandmarker` lite, GPU, `VIDEO`, 1 pose |
| Concurrencia | Web Worker de tipo módulo + `ImageBitmap` transferible |
| Render | Canvas 2D nativo, sin motores gráficos |
| Audio | Web Audio API, sin assets |
| Flotante | `documentPictureInPicture.requestWindow()` |
| Local | IndexedDB vía `idb` |
| Backend | Amplify Gen 2 (`defineAuth` + `defineData`) → AppSync → DynamoDB + Lambda |
| Hosting | AWS Amplify Hosting, despliegue automático desde `main` |
| Tests | Vitest (+ `jsdom` cuando hace falta DOM) |

No hay PixiJS ni Three.js, ni ficheros de audio, ni CDNs.

## Estructura del repositorio

```
spine-hero/
├─ .kiro/
│  ├─ steering/          contexto permanente para el agente
│  └─ specs/             requisitos, diseño y tareas por funcionalidad
├─ amplify/              backend Gen 2: auth, data, Lambda anti-trampa, CSP
├─ public/
│  ├─ models/            pose_landmarker_lite.task
│  ├─ wasm/              runtime de MediaPipe
│  ├─ sprites/           hero.png (8 frames de 128×128)
│  └─ fonts/             Press Start 2P auto-alojada
├─ fixtures/             sesiones de landmarks en JSON para los tests
├─ src/
│  ├─ contracts/         tipos compartidos entre módulos
│  ├─ vision/            cámara, worker, replay, métricas de rendimiento
│  ├─ posture/           métricas, calibración, scoring, estados
│  ├─ game/              motor puro: XP, HP, Flow, logros
│  ├─ feedback/          canvas, audio, notificaciones, partículas
│  ├─ pip/               ventana Document Picture-in-Picture
│  ├─ storage/           IndexedDB, identidad y sincronización
│  ├─ store/             store de Zustand
│  └─ ui/                landing, dashboard y componentes
└─ docs/                 PRIVACY.md
```

Las dependencias van en una sola dirección: `contracts/` no importa nada del
proyecto, `posture/` y `game/` solo importan `contracts/`, y la interfaz está al
final de la cadena. `game/` no sabe que existe una cámara, solo consume
`PostureFrame`.

Los módulos de `posture/` y `game/` son funciones puras: sin DOM, sin
`Date.now()` interno (el tiempo entra como parámetro), sin efectos. Es lo que
permite probarlos contra los fixtures sin cámara ni navegador.

## Puesta en marcha

**Requisitos:** Node 20 o superior y Chrome/Edge 116+ (la API de Document
Picture-in-Picture llegó en la 116). La webcam solo está disponible en
`localhost` o sobre HTTPS.

```bash
git clone git@github.com:vicmaHo/spine-hero.git
cd spine-hero
npm install
npm run dev            # http://localhost:5173
```

Para trabajar contra un backend propio, en otra terminal:

```bash
npx ampx sandbox       # despliega auth + data y escribe amplify_outputs.json
```

El sandbox y el backend de la rama desplegada son entornos distintos, con dos
juegos de tablas DynamoDB independientes: los nicks y registros creados en local
no aparecen en el sitio publicado.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con HMR |
| `npm run build` | Comprueba tipos (`tsc -b`) y genera el build de producción |
| `npm run preview` | Sirve el build de producción en local |
| `npm test` | Vitest en modo watch |
| `npm test -- run` | Vitest en una sola pasada |
| `npm run lint` | ESLint sobre todo el proyecto |
| `npx ampx sandbox` | Backend de Amplify en modo desarrollo |

## Tests

Vitest, con el fichero de test junto al código (`scoring.ts` →
`scoring.test.ts`). Los tests de postura se ejecutan contra sesiones de
landmarks grabadas en `fixtures/`, no contra datos inventados a mano:

| Fixture | Criterio que verifica |
|---|---|
| `session-good.json` | `GOOD` al menos el 95 % del tiempo y score medio ≥ 80 |
| `session-slouch.json` | Transita a `BAD` entre los segundos 23 y 25 y se mantiene |
| `session-lean.json` | Acercarse sin encorvarse no saca del estado `GOOD` |
| `session-away.json` | Detecta la ausencia hacia el segundo 25 y congela el score |

Las reglas del validador anti-trampa también son puras y se prueban sin AWS ni
red.

## Rendimiento

La inferencia está limitada a 5 FPS (un frame cada 200 ms). La postura no cambia
en 33 ms, así que los frames se descartan comparando `performance.now()` en vez
de encolarlos.

Si llega un frame mientras el worker sigue con el anterior, se descarta y su
`ImageBitmap` se cierra. Sin ese `close()` la pestaña acumula memoria muy
rápido.

`src/vision/perfStats.ts` mide p50, p95, FPS reales y frames descartados sobre
una ventana deslizante de 100 muestras, y el store expone esas cifras en
`perf`. El panel que las mostraba en pantalla (`BenchmarksPanel`, `PerfPanel`)
está en el código pero **no está montado en la interfaz**: se retiró de la vista
por decisión de producto.

## Nube y equipos

Identidad de invitado de Cognito (identity pool), sin login social ni
recuperación de contraseña. El nick va de 3 a 16 caracteres del conjunto
`[A-Za-z0-9_-]` y se reserva con una fila propia para garantizar unicidad.

El escritor local vuelca un registro a IndexedDB al cruzar cada límite de
minuto, y el sincronizador envía el agregado del día una vez por minuto, con
hasta 3 intentos y espera exponencial entre ellos. La escritura no va directa a
la tabla:
pasa por la mutación `validateAndUpdateDailyRecord`, respaldada por una Lambda
que localiza la fila existente de ese nick y ese día antes de crear otra y
descarta las cifras incoherentes (rangos imposibles, más segundos que tiempo
transcurrido, incrementos mayores de lo que cabe entre dos escrituras). Los
rechazos llevan un token propio, así el cliente distingue un veredicto real de
un fallo de red y solo reintenta en el segundo caso.

El ranking es por **código de equipo**, no global, y se refresca cada 30
segundos por consulta. La suscripción realtime de AppSync se descartó a
propósito: obligaría a añadir un tercer origen a la CSP.

## Despliegue

Amplify Hosting construye desde `main` siguiendo
[`amplify.yml`](amplify.yml). La fase `backend` ejecuta `ampx pipeline-deploy`,
que despliega la carpeta `amplify/` y genera `amplify_outputs.json` dentro del
contenedor de build; la fase `frontend` corre después y ya lo encuentra. Ese
fichero está en `.gitignore` a propósito y no se commitea.

El resultado se publica en **[spinehero.online](https://spinehero.online)**.

## Compatibilidad

| Navegador | Estado |
|---|---|
| Chrome / Edge 116+ (escritorio) | Compatibilidad completa |
| Firefox, Safari | Degradan sin romperse: la ventana flotante cae al fallback de `window.open()` y el resto funciona igual |
| Móvil y táctil | Fuera de alcance. Es una herramienta de escritorio |

## Desarrollo con Kiro

El proyecto se construyó con [Kiro](https://kiro.dev) usando su flujo de specs.
`.kiro/steering/` guarda el contexto permanente (producto, stack, contratos,
convenciones, reglas por módulo) y `.kiro/specs/` una carpeta por funcionalidad
con requisitos, diseño y tareas. Ambos directorios están versionados como parte
de la documentación del proyecto.

## Créditos

- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) y el modelo
  `pose_landmarker_lite`, de Google, bajo licencia Apache 2.0.
- Tipografía [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P),
  de The Press Start 2P Project Authors, bajo SIL Open Font License 1.1
  ([`public/fonts/OFL.txt`](public/fonts/OFL.txt)).

Los textos de licencia de los componentes de terceros que viajan en el artefacto
publicado están en
[`THIRD-PARTY-LICENSES.txt`](THIRD-PARTY-LICENSES.txt).

## Licencia

El código se distribuye bajo la [Licencia Apache 2.0](LICENSE). Permite uso,
modificación, distribución y uso comercial, incluye una concesión expresa de
patentes y obliga a conservar el aviso de copyright y licencia, a reproducir el
[`NOTICE`](NOTICE) y a señalar los ficheros modificados. Se entrega sin
garantías. Las licencias de terceros están en
[`THIRD-PARTY-LICENSES.txt`](THIRD-PARTY-LICENSES.txt).

El nombre «SpineHero», el logotipo y los recursos gráficos quedan fuera de esa
licencia y son todos los derechos reservados: ver
[`LICENSE-ASSETS`](LICENSE-ASSETS). Puedes reutilizar el código, pero con tu
propio nombre y tu propio arte.

Copyright 2026 Víctor Manuel Hernández, Juan Camilo Pérez, Luis Miguel Becerra.
