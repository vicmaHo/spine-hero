# Pipeline de Visión — Diseño

## Visión general

El pipeline de visión transforma frames de la webcam en landmarks de MediaPipe Pose. Se compone de dos partes: un **controlador en el hilo principal** que gestiona la cámara y el ritmo de envío, y un **Web Worker de tipo módulo** que ejecuta la inferencia.

```
┌─────────────────────────────────────────────────────────────────┐
│  Hilo principal                                                  │
│                                                                  │
│  getUserMedia → <video> → requestVideoFrameCallback (≤5 FPS)    │
│       │                                                          │
│       ▼                                                          │
│  createImageBitmap → transferir al worker (si no está busy)     │
│       │                       │                                  │
│       │ (busy=true)           │ bitmap.close() si busy           │
│       ▼                       ▼                                  │
│  worker.postMessage(FRAME)   descartado                          │
│       │                                                          │
│       ▼                                                          │
│  onmessage(LANDMARKS) → emitir a suscriptores + stats           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Web Worker (tipo módulo)                                        │
│                                                                  │
│  INIT → cargar WASM + modelo desde /public → READY              │
│  FRAME → detectForVideo(bitmap) → filtrar 5 LM → LANDMARKS     │
│  STOP → close landmarker, liberar recursos                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Estructura de ficheros

```
src/vision/
├─ cameraSource.ts        Controlador principal: cámara + envío de frames
├─ inferenceWorker.ts     Web Worker de MediaPipe (tipo módulo)
├─ replaySource.ts        Fuente de replay para fixtures
├─ recorder.ts            Grabación de sesiones de landmarks
├─ perfStats.ts           Cálculo de estadísticas de rendimiento
├─ types.ts               Tipos internos del módulo (no exportados a contracts)
└─ __tests__/
   ├─ perfStats.test.ts
   ├─ recorder.test.ts
   └─ replaySource.test.ts
```

---

## Componentes

### 1. `cameraSource.ts`

Responsabilidad: implementar la interfaz `PostureSource` (parcialmente — la parte de `calibrate` se delegará a `src/posture/`).

**Flujo:**
1. `start()` → pide cámara con `getUserMedia`, crea `<video>`, registra callback.
2. En cada `requestVideoFrameCallback`:
   - Comprueba si han pasado ≥200 ms desde el último frame enviado.
   - Si `busy === true` → descarta (cierra bitmap, incrementa contador).
   - Si no → `createImageBitmap(video)`, transfiere al worker, marca `busy = true`.
3. Al recibir `LANDMARKS` del worker → marca `busy = false`, emite a suscriptores, registra stats.
4. `stop()` → envía `STOP` al worker, detiene tracks de cámara, cancela callback.

**Manejo de errores:**
- `NotAllowedError` → `{ kind: 'CAMERA_DENIED' }`
- `NotReadableError` / `AbortError` → `{ kind: 'CAMERA_BUSY' }`
- Error en INIT del worker → `{ kind: 'MODEL_LOAD_FAILED', detail }`
- Si WebGL2 no está disponible → `{ kind: 'NO_GPU', fallback: 'cpu' }`

### 2. `inferenceWorker.ts`

Web Worker de tipo módulo. Protocolo: `ToWorkerMessage` / `FromWorkerMessage`.

**INIT:**
- Carga `PoseLandmarker` con `FilesetResolver.forVisionTasks(wasmPath)`.
- Configuración: `baseOptions.modelAssetPath = modelPath`, `delegate: 'GPU'`, `runningMode: 'VIDEO'`, `numPoses: 1`.
- Responde `READY` o `ERROR`.

**FRAME:**
- `const t0 = performance.now()`
- `const result = landmarker.detectForVideo(bitmap, t)`
- `bitmap.close()` en `finally`
- Filtra solo los 5 landmarks de `LM`.
- Responde `LANDMARKS` con `inferenceMs = performance.now() - t0`.

**STOP:**
- `landmarker.close()`, limpia referencia.

### 3. `replaySource.ts`

Implementa `PostureSource` reproduciendo landmarks desde un fichero JSON de fixtures.

- Lee un array de `{ t, landmarks, inferenceMs }`.
- Usa `setTimeout` con los deltas entre timestamps consecutivos.
- Emite a suscriptores como si fueran respuestas reales del worker.
- `stop()` cancela todos los timers pendientes.

### 4. `recorder.ts`

- Mantiene un array interno de `FromWorkerMessage` (solo tipo `LANDMARKS`).
- Método `record(msg)` → push.
- Método `export()` → devuelve JSON string del array.
- Método `clear()` → vacía el buffer.

### 5. `perfStats.ts`

Estadísticas de rendimiento sobre una ventana deslizante configurable (por defecto 100 muestras).

- `push(inferenceMs)` → añade muestra, recorta ventana.
- `getP50()` → percentil 50.
- `getP95()` → percentil 95.
- `getFps()` → frames procesados / tiempo transcurrido.
- `getDropped()` → contador de frames descartados (incrementado externamente).

---

## Decisiones de diseño

| Decisión | Justificación |
|---|---|
| `requestVideoFrameCallback` en vez de `setInterval` | Se sincroniza con el framerate real del vídeo; menos drift. |
| Throttle por `performance.now()` ≥ 200 ms | Inferencia a 5 FPS sin importar el framerate de cámara. |
| Flag `busy` en vez de cola | Preferimos perder frames a acumular latencia (RF-2). |
| `ImageBitmap` transferible | Evita copiar pixeles entre hilos; cero-copy en navegadores modernos. |
| Filtrar a 5 landmarks en el worker | Menos datos cruzando el postMessage boundary. |
| Worker tipo módulo | Permite `import` de MediaPipe tasks-vision directamente. |
| Ventana deslizante para stats | p50/p95 estables sin acumular memoria infinita. |

---

## Dependencias permitidas

- `@mediapipe/tasks-vision` (ya en el proyecto)
- Tipos de `src/contracts/worker.ts` y `src/contracts/posture.ts`
- Ninguna otra dependencia npm.
