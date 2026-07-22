# Requirements Document

## Introduction

Shell-app es el andamiaje local del front-end de SpineHero: el store global (Zustand), la fuente mock de postura, el dashboard principal y la persistencia local con IndexedDB. Conecta el pipeline de postura, el motor de juego y la UI sin contener lógica de negocio propia. No incluye backend, PWA ni CSP (esos viven en specs separadas).

## Glossary

- **App_Store**: Store global de Zustand ubicado en `src/store/useAppStore.ts`. Orquesta la comunicación entre PostureSource, motor de juego y UI.
- **PostureSource**: Interfaz definida en `src/contracts/posture.ts` que abstrae cualquier fuente de frames de postura (real, mock o replay).
- **Mock_Source**: Implementación de PostureSource que emite un guion cíclico predecible sin necesidad de cámara. Ubicada en `src/contracts/mockSource.ts`.
- **Dashboard**: Componente principal de la UI que muestra el estado de postura, estadísticas del día y controles de la aplicación.
- **Persistence_Layer**: Módulo en `src/storage/` que gestiona la lectura y escritura en IndexedDB usando la biblioteca `idb`.
- **Minutes_Store**: Object store de IndexedDB que almacena una entrada por minuto con score promedio, estado predominante y segundos en buena postura.
- **Profile_Store**: Object store de IndexedDB que almacena nivel, XP, racha, logros y baseline de calibración del usuario.
- **PostureFrame**: Objeto emitido por PostureSource con timestamp, estado, score, métricas y confianza.
- **Unsubscribe_Function**: Función devuelta por `PostureSource.subscribe()` que cancela la suscripción al invocarla.
- **Cycle**: Secuencia completa del guion mock: 30 s GOOD → 5 s transición → 20 s BAD → 5 s transición → 10 s AWAY (70 s total).

## Requirements

### Requirement 1: Store global — suscripción a PostureSource

**User Story:** Como desarrollador del equipo, quiero que el store global gestione la suscripción a cualquier PostureSource mediante la interfaz, para que la UI y el motor de juego reciban frames sin acoplarse a una implementación concreta.

#### Acceptance Criteria

1. THE App_Store SHALL depend exclusively on the PostureSource interface from `src/contracts/posture.ts`, never on a concrete implementation.
2. WHEN the user starts monitoring, THE App_Store SHALL call `PostureSource.start()` and store the Unsubscribe_Function returned by `PostureSource.subscribe()`.
3. WHEN the user stops monitoring, THE App_Store SHALL invoke the stored Unsubscribe_Function before calling `PostureSource.stop()`, and reset the current frame state to `null`.
4. WHEN a PostureFrame is received via the subscription, THE App_Store SHALL update the current frame state accessible to the UI, where the initial value before any frame is received SHALL be `null`.
5. IF the user attempts to swap the active PostureSource while monitoring is active, THEN THE App_Store SHALL reject the operation without modifying the current source.
6. WHILE monitoring is stopped, WHEN the user requests a source swap, THE App_Store SHALL replace the active PostureSource reference with the provided instance.
7. IF `PostureSource.start()` rejects with a PostureError, THEN THE App_Store SHALL remain in the stopped state, store the error in a field accessible to the UI, and not invoke `subscribe()`.

### Requirement 2: Store global — orquestación sin lógica de negocio

**User Story:** Como desarrollador del equipo, quiero que el store solo orqueste y no contenga lógica de negocio, para que las reglas del juego y la detección de postura vivan en sus módulos puros.

#### Acceptance Criteria

1. THE App_Store SHALL NOT contain scoring algorithms, state machine transitions, XP/HP calculations, or posture metric computations inline; any function body that transforms PostureFrame into a score or that mutates GameState fields based on game rules is a violation.
2. THE App_Store SHALL invoke functions imported from `src/posture/` for posture evaluation and from `src/game/` for game state transitions, without re-implementing or wrapping their logic in local helper functions within the store file.
3. THE App_Store SHALL expose as its state: the current PostureFrame (or `null` before the first frame arrives), the current GameState (initialized to `INITIAL_GAME_STATE`), and the active source type as a discriminated value of `'camera' | 'mock' | 'replay'`.
4. WHEN a new PostureFrame is received from the active PostureSource, THE App_Store SHALL pass it along with the current GameState to the game module's `tick()` function and replace its GameState with the returned result, without applying additional transformations to the TickResult.

### Requirement 3: Mock PostureSource — guion cíclico

**User Story:** Como desarrollador del equipo, quiero una fuente mock con un guion predecible, para poder trabajar en la UI y el motor de juego sin depender del pipeline real de cámara.

#### Acceptance Criteria

1. THE Mock_Source SHALL implement the PostureSource interface completely (start, stop, calibrate, subscribe).
2. WHEN started, THE Mock_Source SHALL emit PostureFrames following a Cycle of exactly 70 s: 30 s in GOOD status, 5 s transition (GOOD→BAD), 20 s in BAD status, 5 s transition (BAD→GOOD), and 10 s in AWAY status.
3. WHILE in the GOOD phase, THE Mock_Source SHALL emit frames with score oscillating between 85 and 95 and confidence of 0.95.
4. WHILE in a transition period between GOOD and BAD (descending), THE Mock_Source SHALL interpolate the score linearly from 85 to 55 over 5 s and switch the status from GOOD to BAD at the midpoint (2.5 s).
5. WHILE in the BAD phase, THE Mock_Source SHALL emit frames with score oscillating between 35 and 55 and confidence of 0.9.
6. WHILE in a transition period between BAD and GOOD (ascending), THE Mock_Source SHALL interpolate the score linearly from 55 to 85 over 5 s and switch the status from BAD to GOOD at the midpoint (2.5 s).
7. WHILE in AWAY status, THE Mock_Source SHALL emit frames with score 0, confidence 0, and all PostureMetrics fields set to 0.
8. WHEN `calibrate()` is called, THE Mock_Source SHALL resolve with a fixed CalibrationBaseline (shoulderWidth: 0.35, neckRatio: 0.95, tilt: 0.02, headTilt: 0.01) after a simulated delay of 2000 ms.
9. THE Mock_Source SHALL emit frames at a fixed interval of 200 ms (5 frames per second).
10. WHEN `stop()` is called, THE Mock_Source SHALL cease emitting frames immediately by clearing the interval timer.

### Requirement 4: Dashboard — visualización del estado actual

**User Story:** Como usuario, quiero ver el estado actual de mi postura con claridad visual, para saber de un vistazo si debo corregir mi posición.

#### Acceptance Criteria

1. THE Dashboard SHALL display the current PostureStatus as a colored indicator element with a distinct background color per status (verde para GOOD, rojo para BAD, gris para AWAY, ámbar para CALIBRATING, púrpura para LOW_CONF) and a text label showing the status name in Spanish.
2. WHEN a new PostureFrame is received, THE Dashboard SHALL display the PostureFrame.score as a numeric value (integer 0–100) and a progress bar where 0 maps to an empty bar and 100 maps to a full bar.
3. THE Dashboard SHALL display a video thumbnail area with a 4:3 aspect ratio reserved for the camera feed preview, showing a placeholder icon when the camera feed is not active.
4. THE Dashboard SHALL render all text labels in Spanish.
5. THE Dashboard SHALL use a single dark theme without any light mode toggle.
6. IF no PostureFrame has been received yet, THEN THE Dashboard SHALL display the status indicator in the CALIBRATING color, a score of 0, and an empty progress bar.

### Requirement 5: Dashboard — controles de operación

**User Story:** Como usuario, quiero poder iniciar, detener y calibrar la detección, y elegir entre fuente real y mock, para controlar la aplicación sin salir del dashboard.

#### Acceptance Criteria

1. WHEN the user presses the start button, THE Dashboard SHALL invoke `PostureSource.start()` and, upon resolution, disable the start button and enable the stop button.
2. WHEN the user presses the stop button, THE Dashboard SHALL invoke `PostureSource.stop()`, disable the stop button, and enable the start button.
3. WHEN the user presses the calibrate button, THE Dashboard SHALL invoke `PostureSource.calibrate()`, disable the calibrate button for the duration of the call, and display a visual indicator that calibration is in progress until the promise resolves or rejects.
4. THE Dashboard SHALL provide a selector to switch between mock source and real source, with mock source selected by default.
5. WHILE monitoring is active, THE Dashboard SHALL disable the source selector and the calibrate button to prevent switching or recalibrating mid-session.
6. IF `PostureSource.start()` rejects with a `PostureError`, THEN THE Dashboard SHALL display an error message indicating the failure kind (`CAMERA_DENIED`, `CAMERA_BUSY`, `MODEL_LOAD_FAILED`, or `NO_GPU`) and keep the start button enabled.
7. WHILE monitoring is not active, THE Dashboard SHALL disable the stop button.

### Requirement 6: Dashboard — estadísticas del día

**User Story:** Como usuario, quiero ver un resumen de mi sesión del día, para tener conciencia de cuánto tiempo llevo con buena postura.

#### Acceptance Criteria

1. THE Dashboard SHALL display today's accumulated seconds in GOOD posture, formatted as MM:SS (e.g., "12:45").
2. THE Dashboard SHALL display today's average score as an integer 0–100, computed from all PostureFrames where status was GOOD or BAD (excluding AWAY, CALIBRATING, and LOW_CONF frames).
3. THE Dashboard SHALL display the current flow streak duration (consecutive seconds in GOOD status), formatted as MM:SS.
4. IF no qualifying PostureFrames have been received today, THEN THE Dashboard SHALL display "0:00" for accumulated good posture, 0 for average score, and "0:00" for flow streak.

### Requirement 7: Dashboard — slots reservados para componentes futuros

**User Story:** Como desarrollador del equipo, quiero que el dashboard reserve espacios para el canvas del avatar y el panel de benchmarks, para que los otros miembros del equipo puedan integrar sus componentes sin reestructurar el layout.

#### Acceptance Criteria

1. THE Dashboard SHALL render a placeholder element with `data-testid="slot-avatar-canvas"` in the layout area designated for the avatar canvas, with a minimum rendered size of 256×256 pixels.
2. THE Dashboard SHALL render a placeholder element with `data-testid="slot-benchmarks-panel"` in the layout area designated for the benchmarks panel, with a minimum rendered size of 320×200 pixels.
3. THE Dashboard SHALL expose an optional `avatarCanvas` prop and an optional `benchmarksPanel` prop, both typed as `ReactNode`, so that other modules can inject their content by passing elements through these props without modifying Dashboard source.
4. IF no `ReactNode` is provided for a slot prop, THEN THE Dashboard SHALL render a visible empty-state indicator within that slot's container showing the slot name as text (e.g., "Avatar Canvas", "Benchmarks Panel").
5. WHEN a `ReactNode` is provided for a slot prop, THE Dashboard SHALL render the provided node inside the corresponding slot container, replacing the empty-state indicator.

### Requirement 8: Persistencia local — Minutes Store

**User Story:** Como usuario, quiero que mis datos de postura se persistan localmente por minuto, para ver mi historial sin depender de una conexión a internet.

#### Acceptance Criteria

1. THE Persistence_Layer SHALL create an IndexedDB database named `spinehero` with a `minutes` object store using the `idb` library.
2. WHEN a minute boundary is crossed during active monitoring (at least one PostureFrame with status GOOD or BAD was received during that minute), THE Persistence_Layer SHALL write one entry to the Minutes_Store containing: the arithmetic mean of all PostureFrame.score values received in that minute (rounded to integer 0–100), the PostureStatus (GOOD or BAD) that occupied the most frames in that minute (defaulting to BAD on tie), and the count of seconds where status was GOOD (derived as number of GOOD frames divided by 5, rounded down, range 0–60).
3. THE Persistence_Layer SHALL write at most one entry per elapsed minute, never per frame.
4. THE Persistence_Layer SHALL use a compound key of date string (YYYY-MM-DD) and minute-of-day index (integer 0–1439) to uniquely identify each entry.
5. IF a write to IndexedDB fails, THEN THE Persistence_Layer SHALL log the error to the console and continue operation without crashing, discarding the failed entry.
6. IF no PostureFrame with status GOOD or BAD is received during an elapsed minute (all frames were AWAY, CALIBRATING, or LOW_CONF, or no frames arrived), THEN THE Persistence_Layer SHALL skip writing an entry for that minute.

### Requirement 9: Persistencia local — Profile Store

**User Story:** Como usuario, quiero que mi progreso de juego y mi calibración se persistan localmente, para no perder mi nivel, XP ni configuración al cerrar el navegador.

#### Acceptance Criteria

1. THE Persistence_Layer SHALL create a `profile` object store in the IndexedDB database named `spinehero`.
2. THE Profile_Store SHALL persist a single record containing: all fields of `GameState` (xp, level, hp, flowSeconds, goodSecondsToday, mood, achievements, streakDays, lastTickAt) and the current `CalibrationBaseline` object.
3. WHEN the GameState changes (level up, XP gain, achievement unlocked, or streak update), THE Persistence_Layer SHALL write the updated profile to the Profile_Store, debounced to at most one write per 5 seconds.
4. WHEN the application starts and a stored profile exists, THE Persistence_Layer SHALL read the profile from IndexedDB and provide it to the App_Store as initial state.
5. IF the application starts and no stored profile exists, THEN THE Persistence_Layer SHALL provide `INITIAL_GAME_STATE` to the App_Store as initial state.
6. WHEN calibration completes successfully, THE Persistence_Layer SHALL save the new `CalibrationBaseline` to the Profile_Store immediately, bypassing the debounce interval.
7. IF an IndexedDB read or write operation fails, THEN THE Persistence_Layer SHALL continue operating with in-memory state and log the error to the console without blocking the user.

### Requirement 10: Persistencia local — no escritura por frame

**User Story:** Como desarrollador, quiero garantizar que la persistencia no se invoque en cada frame de postura, para proteger el rendimiento del hilo principal y la vida útil del almacenamiento.

#### Acceptance Criteria

1. THE Persistence_Layer SHALL batch posture data in memory and write to IndexedDB at most once per elapsed minute.
2. THE Persistence_Layer SHALL NOT perform any IndexedDB write operation in response to individual PostureFrame events.
3. WHEN monitoring stops before a full minute elapses, THE Persistence_Layer SHALL write the partial minute data accumulated up to that point (following the same entry format as a complete minute).
4. IF monitoring stops and zero qualifying PostureFrames were accumulated in the partial minute, THEN THE Persistence_Layer SHALL skip the write for that partial interval.
