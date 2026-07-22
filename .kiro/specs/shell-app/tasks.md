# Implementation Plan: Shell App

## Overview

Implementar el andamiaje front-end de SpineHero: store global (Zustand), persistencia local (IndexedDB via `idb`), y dashboard principal con controles y estadísticas. El mock source ya está implementado; el foco es conectar módulos puros existentes con la UI y el almacenamiento.

## Tasks

- [x] 1. Set up persistence layer — database initialization and data models
  - [x] 1.1 Create `src/storage/db.ts` with IndexedDB initialization
    - Define `SpineHeroDB` interface with `minutes` and `profile` object stores
    - Implement `openSpineHeroDB()` using `idb` library
    - `minutes` store with compound key `[date, minute]`
    - `profile` store with inline key `'current'`
    - Database name: `spinehero`
    - _Requirements: 8.1, 9.1_

  - [x] 1.2 Create `src/storage/minuteBuffer.ts` with in-memory accumulator
    - Define `MinuteEntry` interface (date, minute, avgScore, dominantStatus, goodSeconds)
    - Implement `createMinuteBuffer()` factory returning `push(frame)`, `flush()`, and `reset()` methods
    - `push` only accumulates frames with status GOOD or BAD (skip AWAY, CALIBRATING, LOW_CONF)
    - `flush` computes: arithmetic mean of scores (rounded integer), dominant status (BAD on tie), goodSeconds as floor(goodFrames / 5) clamped to [0, 60]
    - `flush` returns `null` if no qualifying frames were accumulated
    - _Requirements: 8.2, 8.6, 10.1, 10.2_

  - [x] 1.3 Create `src/storage/profileStore.ts` with profile read/write
    - Define `ProfileRecord` interface (gameState + calibration)
    - Implement `loadProfile()` — reads from IndexedDB, returns `null` if not found or on error
    - Implement `saveProfile(record)` — writes to IndexedDB, logs error on failure
    - Implement `saveCalibration(baseline)` — immediate write bypassing debounce
    - All functions handle IndexedDB errors gracefully (console.error, continue)
    - _Requirements: 9.2, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 1.4 Write property tests for minute buffer aggregation
    - **Property 5: Minute entry aggregation correctness**
    - **Property 7: Compound key derivation from timestamp**
    - **Property 8: No write when all frames are non-qualifying**
    - **Validates: Requirements 8.2, 8.4, 8.6**

  - [ ]* 1.5 Write property tests for profile persistence
    - **Property 9: Profile persistence round-trip**
    - **Validates: Requirements 9.2**

- [x] 2. Implement minute writer and profile debounce logic
  - [x] 2.1 Create `src/storage/minuteWriter.ts` — periodic minute boundary writer
    - Implement `startMinuteWriter()` that returns an unsubscribe function
    - Use `setInterval` at 1-second resolution to detect minute boundary crossings
    - On boundary crossing: flush the minute buffer and write entry to IndexedDB
    - On stop (unsubscribe called): flush partial minute if qualifying frames exist
    - Skip write if buffer flush returns `null` (no qualifying frames)
    - Log errors on failed writes without crashing
    - _Requirements: 8.2, 8.3, 8.5, 10.1, 10.3, 10.4_

  - [x] 2.2 Create `src/storage/profileDebounce.ts` — debounced profile saver
    - Implement a debounced writer that writes at most once per 5 seconds
    - Expose `scheduleProfileSave(record: ProfileRecord)` and `flushNow()`
    - Calibration writes bypass debounce (immediate)
    - _Requirements: 9.3, 9.6_

  - [ ]* 2.3 Write property tests for minute writer timing
    - **Property 6: At most one IndexedDB write per elapsed minute**
    - **Property 11: Partial minute flush on stop**
    - **Property 12: No write on stop without qualifying frames**
    - **Validates: Requirements 8.3, 10.1, 10.3, 10.4**

  - [ ]* 2.4 Write property test for profile debounce
    - **Property 10: Profile write debounce — at most one write per 5 seconds**
    - **Validates: Requirements 9.3**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement the global store (`useAppStore`)
  - [x] 4.1 Create `src/store/useAppStore.ts` with Zustand store
    - Define `AppState` interface with: `currentFrame`, `gameState`, `sourceType`, `isMonitoring`, `lastError`, `pendingEvents`
    - Initialize `gameState` from persisted profile (via `loadProfile()`) or `INITIAL_GAME_STATE`
    - Expose actions: `startMonitoring`, `stopMonitoring`, `swapSource`, `calibrate`
    - Depend exclusively on `PostureSource` interface, never concrete implementations
    - _Requirements: 1.1, 2.3_

  - [x] 4.2 Implement subscription lifecycle in the store
    - `startMonitoring`: call `source.start()`, on success store unsubscribe from `source.subscribe()`, set `isMonitoring: true`
    - On frame received: update `currentFrame`, call `tick(gameState, frame, Date.now())`, replace `gameState` with result
    - `stopMonitoring`: invoke stored unsubscribe, call `source.stop()`, reset `currentFrame` to `null`, set `isMonitoring: false`
    - If `start()` rejects: stay in stopped state, store error in `lastError`, do not call `subscribe()`
    - _Requirements: 1.2, 1.3, 1.4, 1.7, 2.4_

  - [x] 4.3 Implement source swap guard in the store
    - `swapSource` rejects (returns `false`) if `isMonitoring === true`
    - `swapSource` replaces active source and updates `sourceType` when monitoring is stopped
    - _Requirements: 1.5, 1.6_

  - [x] 4.4 Wire store to persistence layer
    - On `gameState` changes: schedule profile save via debounced writer
    - On `calibrate()` success: save calibration immediately via `saveCalibration()`
    - Connect minute buffer: push frames to buffer on each subscription callback
    - Start minute writer when monitoring starts, stop it when monitoring stops
    - _Requirements: 9.3, 9.6, 10.1, 10.3_

  - [ ]* 4.5 Write property tests for the store
    - **Property 1: Store frame receipt triggers tick and updates state atomically**
    - **Property 2: Source swap guard — swap succeeds if and only if monitoring is stopped**
    - **Property 3: Start failure preserves stopped state and captures error**
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7, 2.4**

  - [ ]* 4.6 Write unit tests for the store
    - Test initial state shape matches contract
    - Test start/stop lifecycle with mock source
    - Test that store does not contain scoring or game logic inline
    - _Requirements: 1.1, 2.1, 2.2_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Dashboard UI
  - [x] 6.1 Create `src/ui/Dashboard.tsx` with layout structure and slots
    - Define `DashboardProps` with optional `avatarCanvas` and `benchmarksPanel` (typed as `ReactNode`)
    - Render slot containers with `data-testid="slot-avatar-canvas"` (min 256×256px) and `data-testid="slot-benchmarks-panel"` (min 320×200px)
    - Show empty-state indicator text ("Avatar Canvas", "Benchmarks Panel") when no ReactNode provided
    - Replace empty-state with provided ReactNode when prop is passed
    - Dark theme, all labels in Spanish
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 4.4, 4.5_

  - [x] 6.2 Implement `StatusIndicator` and `ScoreBar` sub-components
    - `StatusIndicator`: colored background per status (verde=GOOD, rojo=BAD, gris=AWAY, ámbar=CALIBRATING, púrpura=LOW_CONF) + Spanish label
    - `ScoreBar`: progress bar 0–100 showing `PostureFrame.score` as integer + bar fill
    - Default state (no frame): CALIBRATING color, score 0, empty bar
    - _Requirements: 4.1, 4.2, 4.6_

  - [x] 6.3 Implement `DayStats` sub-component
    - Display accumulated seconds in GOOD posture formatted as MM:SS
    - Display today's average score (integer 0–100, excluding AWAY/CALIBRATING/LOW_CONF frames)
    - Display current flow streak as MM:SS
    - Default: "0:00" for time values, 0 for score
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 6.4 Implement `ControlPanel` sub-component
    - Start button: invokes `startMonitoring()`, disables on success, enables stop
    - Stop button: invokes `stopMonitoring()`, disables self, enables start
    - Calibrate button: invokes `calibrate()`, disables during promise, shows progress indicator
    - Source selector: toggle between mock/real, disabled while monitoring active
    - Error display: shows `PostureError.kind` on start failure
    - Stop button disabled when not monitoring
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 6.5 Implement video thumbnail placeholder
    - Reserve 4:3 aspect ratio area for camera feed preview
    - Show placeholder icon when camera not active
    - _Requirements: 4.3_

  - [ ]* 6.6 Write unit tests for Dashboard
    - Test rendering in default state (no frame)
    - Test status indicator color mapping for each status
    - Test button enable/disable states
    - Test slot injection with ReactNode props
    - Test error message display
    - _Requirements: 4.1, 4.6, 5.6, 5.7, 7.3, 7.4, 7.5_

- [x] 7. Wire Dashboard into the app entry point
  - [x] 7.1 Update `src/App.tsx` to render Dashboard connected to the store
    - Import `useAppStore` and pass relevant state/actions to Dashboard
    - Initialize the store with persisted profile on app start
    - Ensure mock source is the default active source
    - _Requirements: 2.3, 5.4_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Mock source property test (complement to existing tests)
  - [ ]* 9.1 Write property test for mock source cycle correctness
    - **Property 4: Mock source cycle produces correct frame for any time offset**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The mock source (`src/contracts/mockSource.ts`) is already implemented and tested — no changes needed
- The `game/` module (`tick()` function) is an external dependency owned by team member M; the store imports it without reimplementing
- Property tests use `fast-check` (needs to be added as dev dependency — confirm with user)
- Unit tests for Dashboard use `@testing-library/react` (needs to be added as dev dependency — confirm with user)
- Persistence tests should use `fake-indexeddb` for simulating IndexedDB in Node
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "1.5", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4"] },
    { "id": 5, "tasks": ["4.5", "4.6", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4", "6.5"] },
    { "id": 7, "tasks": ["6.6", "7.1"] },
    { "id": 8, "tasks": ["9.1"] }
  ]
}
```
