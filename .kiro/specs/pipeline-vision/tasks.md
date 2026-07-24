# Pipeline de Visión — Tareas

## Tareas de implementación

- [x] 1. Crear `src/vision/perfStats.ts`: clase `PerfStats` con ventana deslizante, métodos `push`, `getP50`, `getP95`, `getFps`, `getDropped`, `incrementDropped`. Test en `src/vision/__tests__/perfStats.test.ts`.
- [x] 2. Crear `src/vision/recorder.ts`: clase `LandmarkRecorder` con métodos `record`, `export` (JSON), `clear`. Test en `src/vision/__tests__/recorder.test.ts`.
- [x] 3. Crear `src/vision/inferenceWorker.ts`: Web Worker tipo módulo que implementa el protocolo `ToWorkerMessage`/`FromWorkerMessage`. Carga modelo y WASM desde rutas locales (`/public/models/`, `/public/wasm/`). Filtra a 5 landmarks. Cierra `ImageBitmap` en `finally`.
- [x] 4. Crear `src/vision/cameraSource.ts`: controlador del hilo principal. `getUserMedia` + `requestVideoFrameCallback` throttleado a 5 FPS. Flag `busy` para descartar frames en vuelo. Mapea errores de cámara a `PostureError`. Emite landmarks a suscriptores vía patrón pub/sub.
- [x] 5. Crear `src/vision/replaySource.ts`: implementa la interfaz `PostureSource` reproduciendo landmarks desde un JSON de fixtures con deltas de tiempo reales. Test en `src/vision/__tests__/replaySource.test.ts`.
- [x] 6. Copiar assets de MediaPipe a `public/models/` y `public/wasm/`. Verificar que `vite.config.ts` sirve correctamente los ficheros `.task` y `.wasm`.
- [x] 7. Integración: verificar que el pipeline arranca, el worker responde `READY`, se reciben landmarks y `perfStats` acumula datos. Probar descarte de frames con throttle artificial.
