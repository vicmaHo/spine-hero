# Arquitectura de SpineHero

Este documento describe la arquitectura de la aplicación mediante once diagramas. El
[README](../README.md) expone qué hace SpineHero y por qué se tomó cada decisión; aquí se
detalla cómo encajan las piezas entre sí.

Cada diagrama va acompañado de los ficheros de los que se deriva, de modo que su
contenido pueda verificarse contra el código fuente.

| | Diagrama | Contenido |
|---|---|---|
| 1 | [Mapa del sistema](#1-mapa-del-sistema) | Reparto de responsabilidades entre el navegador y la nube |
| 2 | [Casos de uso](#2-casos-de-uso) | Capacidades disponibles con y sin nick |
| 3 | [Recorrido de la interfaz](#3-recorrido-de-la-interfaz) | Vistas y fases de identidad |
| 4 | [Dependencias entre módulos](#4-dependencias-entre-módulos) | Direcciones de import permitidas |
| 5 | [Del frame al veredicto](#5-del-frame-al-veredicto) | Ciclo de inferencia a 5 FPS |
| 6 | [Estados de la postura](#6-estados-de-la-postura) | Máquina de estados e histéresis |
| 7 | [Alta de un nick](#7-alta-de-un-nick) | Garantía de unicidad de nick y correo |
| 8 | [Acceso con un nick existente](#8-acceso-con-un-nick-existente) | Verificación de titularidad |
| 9 | [Modelo de datos](#9-modelo-de-datos) | Tablas, índices y autorización |
| 10 | [Sincronización y anti-trampa](#10-sincronización-y-anti-trampa) | Recorrido de un agregado diario hasta el ranking |
| 11 | [Despliegue](#11-despliegue) | Cadena entre `git push` y el sitio publicado |

---

## 1. Mapa del sistema

La frontera relevante del sistema es la del navegador. El vídeo, los `ImageBitmap` y los
landmarks permanecen dentro de él; la cruzan únicamente los enteros agregados del día y,
en el momento del alta, un nick y un correo.

```mermaid
flowchart TB
  subgraph EQ["Tu equipo · nada de esto sale a la red"]
    direction TB
    CAM(["Webcam"]) -->|"ImageBitmap · 5 FPS"| WK["Web Worker<br/>PoseLandmarker lite · GPU"]
    WK -->|"5 landmarks de 33"| POST["posture/ + game/<br/>funciones puras"]
    POST --> ST["store/ · Zustand"]
    ST --> VW["ui/ · dashboard y ranking"]
    ST --> PP["pip/ · ventana flotante"]
    ST --> IDB[("IndexedDB<br/>minutes · profile · identity<br/>sync · dayCarry")]
    IDB --> SY["storage/synchronizer"]
    LOC[["public/ · modelo .task, WASM,<br/>sprites y tipografía"]] -.->|"mismo origen"| WK
    DC["cliente de datos<br/>authMode: identityPool"]
    SY --> DC
    VW --> DC
  end
  subgraph AWS["AWS · us-east-1"]
    direction TB
    HOST["Amplify Hosting<br/>+ CloudFront"]
    COG["Cognito<br/>identity pool"]
    APS["AppSync · GraphQL"]
    LAM["Lambda<br/>antiCheatValidator"]
    DDB[("DynamoDB · 5 tablas")]
    APS -->|"validateAndUpdateDailyRecord"| LAM
    LAM --> DDB
    APS --> DDB
  end
  HOST -->|"bundle + cabeceras CSP"| VW
  COG -.->|"credenciales de invitado"| DC
  DC ==>|"enteros del día · nick y correo solo al alta"| APS
```

No existe ninguna arista de AWS hacia el worker: el modelo y el runtime WASM se sirven
desde el propio origen (`public/`), condición que permite limitar `connect-src` a dos
orígenes en la política de seguridad de contenido. La única vía de escritura hacia
DynamoDB atraviesa la función Lambda de validación; el navegador no dispone de acceso
directo a las tablas.

`amplify/hosting/custom-headers.yml` · `src/vision/cameraSource.ts` ·
`src/storage/synchronizer.ts` · `amplify/data/resource.ts`

---

## 2. Casos de uso

El sistema contempla un único actor con dos niveles de capacidad, representados en el
código por los dos valores de `identityPhase`. La distinción es funcional y no
cosmética: sin identidad activa, el sincronizador termina su ejecución antes de emitir
cualquier operación.

```mermaid
flowchart LR
  U(("Usuario"))
  subgraph SIN["Sin nick · identityPhase: guest"]
    direction TB
    A1["Medir la postura y calibrar"]
    A2["Sacar la ventana flotante"]
    A3["Acumular XP, HP, Flow y logros"]
    A4["Consultar el ranking de un equipo"]
  end
  subgraph CON["Con nick · identityPhase: granted"]
    direction TB
    B1["Todo lo de la izquierda"]
    B2["Aparecer en el ranking del equipo"]
    B3["Conservar lo acumulado hoy al reentrar"]
    B4["Cambiar de usuario y cerrar sesión"]
  end
  U --> A1 & A2 & A3 & A4
  U --> B1 & B2 & B3 & B4
```

Consultar el ranking no exige nick, ya que basta un código de equipo, pero figurar en él
sí lo requiere: cada fila se identifica por `displayName`, que es el nick. El caso B3
merece una precisión. Al volver a entrar el mismo día, el cliente parte de cero segundos
acumulados; son el acarreo (`storage/dayCarry.ts`) y el suelo monótono que aplica la
Lambda los que impiden que ese valor sobrescriba la fila ya existente en el ranking.

`src/store/useAppStore.ts` (`identityPhase`) · `src/ui/GuestNotice.tsx` ·
`src/ui/SyncControl.tsx` · `src/storage/synchronizer.ts` · `src/storage/dayCarry.ts`

---

## 3. Recorrido de la interfaz

La navegación se compone de dos máquinas de estados anidadas: la de la vista, en
`App.tsx`, y la de la fase de identidad, que `NickGate` gobierna sobre `identityPhase`.

```mermaid
stateDiagram-v2
  direction TB
  [*] --> landing
  state "landing · LandingPage" as landing
  state "loading · SplashScreen" as loading
  landing --> loading: «Empezar ahora»
  loading --> app: la splash termina
  note right of loading
    El NickGate ya está montado detrás:
    bootstrapIdentity() lee IndexedDB
    mientras la splash tapa la pantalla,
    así no hay parpadeo al retirarla.
  end note
  state app {
    direction TB
    [*] --> P1
    state "identityPhase: loading" as P1
    state "identityPhase: form" as P2
    state "identityPhase: granted" as P3
    state "identityPhase: guest" as P4
    P1 --> P3: había un nick guardado
    P1 --> P2: no había ninguno
    P2 --> P3: alta o acceso correctos
    P2 --> P4: «continuar sin nick»
    P4 --> P2: «elegir nick»
    P3 --> P2: «cambiar de usuario»
  }
  app --> landing: «volver»
```

Las fases `granted` y `guest` renderizan el mismo dashboard; la diferencia reside en qué
componentes se montan dentro de él y en si el sincronizador arranca. La acción «cambiar
de usuario» invoca `clearAllLocalUserData()` antes de devolver al formulario, con lo que
el siguiente nick no hereda los minutos acumulados por el anterior.

`src/App.tsx` · `src/ui/NickGate.tsx` · `src/store/useAppStore.ts`

---

## 4. Dependencias entre módulos

El grafo se deriva de los `import` relativos de todos los ficheros `.ts` y `.tsx` de
`src/` que no son tests. Se omiten `src/assets/`, que contiene imágenes, y los ficheros
de prueba.

```mermaid
flowchart TD
  RT["main.tsx · App.tsx"]
  UI["ui/<br/>landing, dashboard, ranking"]
  PI["pip/<br/>ventana flotante"]
  ST["store/<br/>Zustand · el único orquestador"]
  SO["storage/<br/>IndexedDB, identidad, sync"]
  FE["feedback/<br/>canvas, audio, avisos"]
  VI["vision/<br/>cámara y worker"]
  PO["posture/<br/>métricas, calibración, estados"]
  GA["game/<br/>XP, HP, Flow, logros"]
  CT["contracts/<br/>tipos compartidos"]
  AM["amplify/data/<br/>tipos del esquema"]
  RT --> UI
  UI --> ST & FE & SO & PI & CT & AM
  PI --> ST & FE & CT
  ST --> SO & VI & PO & GA & CT
  SO --> CT & AM
  FE --> GA & CT
  VI --> CT
  PO --> CT
  GA --> CT
```

Las propiedades que sostienen esta organización son cuatro:

- `contracts/` no importa nada del proyecto. Es el sumidero del grafo, y esa condición es
  la que le permite actuar como idioma común entre módulos sin introducir ciclos.
- `posture/` y `game/` dependen únicamente de `contracts/`. Al ser funciones
  puras, pueden probarse contra los fixtures sin cámara ni navegador.
- El store es el único módulo que conoce simultáneamente `vision/` y `posture/`. Crea el
  `CameraSource` y lo inyecta en `createPostureSource(source)` como un `LandmarkSource`,
  de forma que `posture/` no sabe que existe una cámara y `vision/` no sabe qué se hace
  con los landmarks.
- Dos aristas se apartan del patrón general. `feedback/ → game/` existe porque `hud.ts`
  emplea `xpProgress` para que el HUD del canvas y el dashboard no muestren cifras
  distintas. `ui/ → storage/` existe porque el `RankingPanel` consulta el ranking y la
  identidad local sin pasar por el store; es una excepción pendiente de reubicar.

Ningún módulo importa `ui/` ni `pip/` salvo la raíz: la interfaz ocupa el extremo final
de la cadena de dependencias.

---

## 5. Del frame al veredicto

La secuencia siguiente describe el ciclo que se repite cinco veces por segundo, desde la
captura de la webcam hasta la actualización de la mascota.

```mermaid
sequenceDiagram
  participant C as vision/cameraSource
  participant W as Web Worker
  participant P as posture/postureSource
  participant G as game/engine
  participant S as store
  participant F as feedback + pip
  participant D as storage/minuteWriter

  loop cada 200 ms · 5 FPS
    Note over C: si no han pasado 200 ms, o el worker sigue ocupado,<br/>el frame se descarta y su ImageBitmap se cierra
    C->>C: createImageBitmap(video)
    C->>W: FRAME + bitmap transferido
    activate W
    W->>W: detectForVideo → 33 landmarks
    W-->>C: LANDMARKS · solo 5 (nariz, orejas, hombros)
    deactivate W
    C->>P: onLandmarks(t, landmarks)
    P->>P: guardas · 5 landmarks, confianza ≥ 0,7,<br/>ancho de hombros, orientación de la cabeza
    P->>P: métricas 2D → score → EMA(0,4) → transition()
    P-->>S: PostureFrame · status, score, metrics, confidence
    S->>G: tick(estado, frame, ahora)
    G-->>S: estado nuevo + eventos
    S->>D: push(frame)
    S->>F: eventos + frame
    F->>F: sonido 8-bit, partículas al volver a GOOD, aviso de hito
  end
  D->>D: al cruzar el límite de minuto → IndexedDB.minutes
```

El descarte de frames es el mecanismo que mantiene acotado el presupuesto de cómputo: se
comparan marcas de `performance.now()` en lugar de encolar los frames entrantes, y el
`ImageBitmap` de todo frame descartado se cierra siempre, sin lo cual la pestaña acumula
memoria con rapidez. El motor de juego recibe el instante actual como parámetro
(`tick(state, frame, now)`) y no consulta el reloj por su cuenta.

`src/vision/cameraSource.ts` · `src/posture/pipeline.ts` · `src/game/engine.ts` ·
`src/store/useAppStore.ts` (`pushFrame`) · `src/feedback/feedbackBridge.ts`

---

## 6. Estados de la postura

La máquina define cuatro estados y una regla común a todos ellos: ninguna transición es
inmediata.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> GOOD
  CALIBRATING --> GOOD: baseline capturada
  GOOD --> BAD: score < 60 · 8 s
  BAD --> GOOD: score > 75 · 3 s
  GOOD --> LOW_CONF: confianza < 0,7 · 1 s
  BAD --> LOW_CONF: confianza < 0,7 · 1 s
  GOOD --> AWAY: sin landmarks · 5 s
  BAD --> AWAY: sin landmarks · 5 s
  LOW_CONF --> GOOD: señal válida · 2 s
  LOW_CONF --> BAD: señal válida · 2 s
  AWAY --> GOOD: señal válida · 2 s
  AWAY --> BAD: señal válida · 2 s
  note right of AWAY
    Recuperar devuelve a lastStableStatus,
    el último GOOD o BAD antes de perder
    la señal: levantarse y volver no
    cambia el veredicto ni penaliza.
  end note
```

Los umbrales de entrada y de salida son distintos de forma deliberada, 60 para caer y 75
para volver, y además cada transición debe sostenerse durante un tiempo mínimo. El
mecanismo es idéntico en todos los casos:

```mermaid
stateDiagram-v2
  direction LR
  state "status actual" as A
  state "pendiente<br/>pendingTarget + pendingSince" as B
  state "status nuevo" as C
  A --> B: la condición se cumple
  B --> C: se mantiene el tiempo mínimo
  B --> A: la condición se rompe · reset
```

El estado `CALIBRATING` no lo produce la máquina de estados, sino `postureSource`
durante los cinco segundos de calibración; el motor de juego lo trata igual que `AWAY` y
`LOW_CONF`, congelando toda la mecánica. Las reglas se evalúan en un orden fijo de
prioridad: ausencia, confianza baja, recuperación, caída a `BAD`, subida a `GOOD` y
reset.

`src/posture/stateMachine.ts` · `src/posture/postureSource.ts` · `src/game/engine.ts`

---

## 7. Alta de un nick

La unicidad no se comprueba leyendo y escribiendo después, porque entre ambas operaciones
cabe otra alta simultánea. Se delega en la condición de escritura que DynamoDB aplica
sobre la clave de partición de `NickClaim` y `EmailClaim`: un `create` con una clave ya
existente falla en el servidor y no deja registro parcial.

```mermaid
sequenceDiagram
  participant F as ui/NickForm
  participant I as storage/identityService
  participant D as AppSync + DynamoDB
  participant L as IndexedDB

  F->>I: signUp(nick, correo)
  I->>I: patrón de nick y de correo · sin red
  I->>I: navigator.onLine
  Note over I,D: cada operación con un plazo de 10 s
  I->>D: EmailClaim.create(correo, uuid)
  alt clave libre
    D-->>I: reservada
  else clave ocupada
    I->>D: UserIdentity.listByEmail(correo)
    alt hay identidad con ese correo
      D-->>I: nick del titular
      I-->>F: EMAIL_TAKEN + nick · ofrece «entrar con ese nick»
    else claim huérfana de un alta interrumpida
      I->>D: EmailClaim.get(correo)
      D-->>I: identityId anterior · se reutiliza
    end
  end
  I->>D: NickClaim.create(nickLower, identityId)
  alt clave ocupada
    I->>D: UserIdentity.listByNickLower(nickLower)
    Note over I,D: si nadie lleva ese nick, la claim está huérfana<br/>y el nick sigue libre · solo si lo lleva otra identidad → NICK_TAKEN
  end
  I->>D: UserIdentity.create(id, nick, nickLower, correo)
  I->>L: saveLocalIdentity · un fallo aquí no revoca el acceso
  I-->>F: identidad activa → identityPhase: granted
```

Las dos ramas de «clave ocupada» responden a una necesidad concreta. Ninguna claim se
elimina nunca, de modo que existen claims huérfanas: correos reservados por un alta que
se interrumpió y nicks abandonados tras un cambio de nick. Sin la comprobación contra
`UserIdentity`, un nick abandonado quedaría permanentemente inservible, con la vía «ya
tengo nick» indicando que no está registrado y la vía «crear nick» indicando que ya está
en uso.

`src/storage/identityService.ts` · `src/storage/identityClient.ts` ·
`amplify/data/resource.ts`

---

## 8. Acceso con un nick existente

Entrar con un nick ya creado exige el correo con el que se reclamó. Esta comprobación
constituye la capa de verificación de titularidad.

```mermaid
sequenceDiagram
  participant F as ui/NickForm
  participant I as storage/identityService
  participant D as AppSync + DynamoDB
  participant L as IndexedDB

  F->>I: signIn(nick, correo)
  I->>I: patrón de nick y de correo · sin red
  I->>D: UserIdentity.listByEmail(correo)<br/>selectionSet: id y nick
  alt ese correo no tiene identidad
    D-->>I: vacío
    I-->>F: NICK_EMAIL_MISMATCH
  else la tiene, pero con otro nick
    D-->>I: nick del titular
    I-->>F: NICK_EMAIL_MISMATCH
  else coinciden
    D-->>I: nick del titular
    I->>L: saveLocalIdentity · el nick tal como está almacenado
    I-->>F: acceso concedido
  end
```

Dos decisiones sostienen este flujo:

1. **La consulta se realiza por correo y no por nick.** La comprobación necesita
   enfrentar dos valores, y el que se recupera del servidor queda expuesto en el cliente.
   Consultando por nick habría que traer el correo almacenado para compararlo en el
   navegador, con lo que cualquiera que conociera un nick podría leer el correo de su
   titular. Consultando por correo, lo que retorna es el nick, dato que el ranking ya
   publica, y el correo no sale del servidor.
2. **Los dos motivos de rechazo comparten un único mensaje.** Distinguir «ese correo no
   existe» de «ese correo pertenece a otro nick» permitiría enumerar correos registrados.

El alcance de esta capa está declarado en [PRIVACY.md](PRIVACY.md), limitación 7: la
comprobación la resuelve el cliente y las credenciales de invitado permiten leer
`UserIdentity` y `EmailClaim`. Disuade el acceso casual, no un intento deliberado.

`src/storage/identityService.ts` (`signIn`) · `src/storage/identityErrors.ts`

---

## 9. Modelo de datos

El esquema define cinco modelos en `amplify/data/resource.ts`. No existen claves ajenas,
puesto que DynamoDB no las contempla: las relaciones del diagrama son lógicas y las
sostiene el código de aplicación.

```mermaid
erDiagram
  UserIdentity {
    ID id PK "uuid generado en el navegador"
    String nick "3-16 caracteres, tal como se escribió"
    String nickLower "GSI listByNickLower"
    String email "GSI listByEmail · nunca se devuelve"
  }
  NickClaim {
    String nickLower PK "cerrojo de unicidad"
    String identityId
  }
  EmailClaim {
    String email PK "cerrojo de unicidad"
    String identityId
  }
  DailyRecord {
    ID id PK
    AWSDate date "clave de orden de los dos GSI"
    String displayName "el nick · GSI listByNameAndDate"
    String teamCode "GSI listByTeamAndDate"
    Int goodPostureSeconds "lo que ordena el ranking"
    Int longestFlowStreak
    Int avgScore
    Int level
    Int xp
  }
  Streak {
    ID id PK
    Int currentDays
    Int bestDays
    String lastActiveDate
  }
  UserIdentity ||--|| NickClaim: "reserva nickLower"
  UserIdentity ||--|| EmailClaim: "reserva email"
  UserIdentity ||--o{ DailyRecord: "por displayName, no por id"
```

| Modelo | Clave | Índices secundarios | Autorización |
|---|---|---|---|
| `UserIdentity` | `id` | `listByNickLower`, `listByEmail` | invitado: crear, leer, actualizar |
| `NickClaim` | `nickLower` | — | invitado: crear, leer |
| `EmailClaim` | `email` | — | invitado: crear, leer |
| `DailyRecord` | `id` | `listByTeamAndDate`, `listByNameAndDate` | invitado: crear, leer, actualizar |
| `Streak` | `id` | — | `allow.owner()` |

Tres aspectos del modelo requieren explicación:

- **`DailyRecord` se relaciona con la identidad por `displayName` y no por `id`.** Así la
  Lambda puede localizar la fila de un nick y un día sin depender del puntero que el
  cliente guarda en IndexedDB, que desaparece al borrar los datos del sitio o al entrar
  desde otro navegador. Antes de existir `listByNameAndDate`, cada pérdida de ese puntero
  generaba una fila adicional del mismo nick para el mismo día.
- **`Streak` está declarado pero no se utiliza.** `allow.owner()` exige un usuario
  autenticado y la aplicación solo emplea credenciales de invitado desde que se retiró el
  Authenticator, por lo que no existe ninguna ruta que lo alcance. El nombre aparece una
  única vez en el repositorio, en `resource.ts`. La racha que muestra la interfaz se
  calcula en local, en `storage/streakCalculator.ts`.
- La mutación `validateAndUpdateDailyRecord` es la única puerta de escritura del
  sincronizador. El rol de la Lambda dispone de permisos `mutate` y `query`, ya que
  necesita consultar `listByNameAndDate` antes de decidir si crea o actualiza la fila.

---

## 10. Sincronización y anti-trampa

El recorrido de un minuto registrado en local hasta el ranking pasa por el veredicto del
servidor.

```mermaid
sequenceDiagram
  participant B as IndexedDB
  participant S as storage/synchronizer
  participant A as AppSync
  participant L as Lambda antiCheatValidator
  participant T as DynamoDB

  Note over B: el minuteWriter escribe una entrada<br/>al cruzar cada límite de minuto
  loop cada 60 s · y al reconectar, al ocultar la pestaña y al cerrarla
    S->>S: sin red, sin identidad o con un envío en curso → no emite nada
    S->>B: minutos del día + perfil + acarreo
    S->>S: buildCheckpoint → enteros del día
    S->>A: validateAndUpdateDailyRecord(...)
    A->>L: invoca
    L->>L: validateWrite · 7 reglas puras
    alt alguna regla falla
      L-->>A: error con el token ANTICHEAT_REJECT
      A-->>S: rechazo
      Note over S: no se reintenta: los mismos números<br/>volverían a rechazarse
    else veredicto aceptado
      L->>T: findById(id) o listByNameAndDate(nick, fecha)
      L->>L: keepMonotonic · los contadores del día no bajan
      L->>T: create sin id · o update con id
      T-->>L: fila
      L-->>A: id, date, goodPostureSeconds
      A-->>S: ok
      S->>B: guarda el id de la fila para el próximo envío
    end
  end
```

Las siete reglas se evalúan en el orden fijo siguiente:

| Regla | Rechaza cuando |
|---|---|
| `DATE_WINDOW` | la fecha declarada dista más de un día de la fecha UTC de recepción |
| `DAILY_MAX` | `goodPostureSeconds` pasa de 86 400 (un día) |
| `ELAPSED_TODAY` | declara más segundos que los transcurridos del día, con 50 400 s de margen por zona horaria |
| `FLOW_VS_GOOD` | la racha de Flow supera los segundos de buena postura, con 60 s de margen por el redondeo a minutos |
| `AVG_SCORE_RANGE` | `avgScore` cae fuera de 0-100 |
| `LEVEL_XP_COHERENCE` | el nivel no cuadra con el XP según `100 × nivel^1,5` |
| `INCREMENT_VS_ELAPSED` | el incremento supera el tiempo desde la última escritura × 1,1 |

Las seis primeras reglas examinan solo los valores declarados, de modo que su resultado
no depende de lo que el cliente afirme sobre el estado anterior; `INCREMENT_VS_ELAPSED`
únicamente se evalúa cuando llegan los valores previos. La distinción determinante es la
del token: un error con `ANTICHEAT_REJECT` constituye un veredicto y no se reintenta,
mientras que cualquier otro error, sea de permisos, de red o por una mutación no
desplegada, se considera un fallo de infraestructura y se reintenta hasta tres veces con
espera exponencial. Sin esa distinción, un fallo de red se interpretaría como una
acusación de trampa.

`src/storage/minuteWriter.ts` · `src/storage/synchronizer.ts` ·
`amplify/data/anti-cheat-handler/rules.ts` ·
`amplify/data/anti-cheat-handler/decision.ts`

---

## 11. Despliegue

Un `git push` a `main` construye el backend y el frontend en el mismo contenedor, en ese
orden. La secuencia es obligatoria: `amplify_outputs.json` lo genera la fase de backend y
`src/main.tsx` lo importa de forma estática, por lo que sin esa fase el frontend no
compila.

```mermaid
flowchart TB
  PUSH["git push origin main"] --> GH["GitHub"]
  GH --> AH["Amplify Hosting"]
  subgraph BUILD["Contenedor de build · amplify.yml"]
    direction TB
    B1["fase backend · npm ci"] --> B2["npx ampx pipeline-deploy<br/>--branch main --app-id"]
    B2 --> B3[["amplify_outputs.json<br/>generado aquí, no está en git"]]
    B3 --> F1["fase frontend · npm ci"]
    F1 --> F2["npm run build<br/>tsc -b + vite build"]
    F2 --> F3[["dist/"]]
  end
  AH --> B1
  B2 -.->|"CloudFormation"| STACK["Cognito · AppSync<br/>DynamoDB · Lambda"]
  F3 --> CF["CloudFront<br/>+ custom-headers.yml · CSP"]
  CF --> WWW(["spinehero.online"])
  SBX["npx ampx sandbox · en local"] -.->|"stack propio"| STACK2["backend de desarrollo<br/>otro juego de tablas"]
```

El sandbox y el backend de la rama desplegada son entornos independientes, con dos juegos
de tablas, dos APIs y dos pools. Los nicks y los `DailyRecord` creados en local no
aparecen en el sitio publicado, y ese comportamiento es el esperado.

`amplify.yml` · `amplify/backend.ts` · `amplify/hosting/custom-headers.yml`

---

## Especificaciones

Los diagramas anteriores ofrecen una vista de conjunto. La fuente de verdad de cada
funcionalidad son sus especificaciones, que contienen los requisitos en formato EARS, el
diseño y las tareas:

| Spec | Cubre |
|---|---|
| [`pipeline-vision`](../.kiro/specs/pipeline-vision/) | cámara, worker, presupuesto de cómputo |
| [`deteccion-postura`](../.kiro/specs/deteccion-postura/) | métricas, calibración, scoring, estados |
| [`postura-lateral`](../.kiro/specs/postura-lateral/) | detección de orientación de la cabeza |
| [`juego-feedback`](../.kiro/specs/juego-feedback/) | motor, canvas, audio, notificaciones |
| [`shell-app`](../.kiro/specs/shell-app/) | landing, dashboard, ventana flotante |
| [`backend-nube`](../.kiro/specs/backend-nube/) | esquema, sincronización, anti-trampa |
| [`identidad-nick`](../.kiro/specs/identidad-nick/) | alta, acceso, titularidad, ranking |
