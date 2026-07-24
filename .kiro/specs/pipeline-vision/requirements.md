# Pipeline de Visión — Requisitos

## Contexto

SpineHero detecta la postura del usuario con la webcam procesando todo localmente en el navegador. Este pipeline cubre **exclusivamente** la captura de vídeo y la inferencia de landmarks. El cálculo de métricas, la calibración y la máquina de estados pertenecen a la spec `deteccion-postura` y **no** se incluyen aquí.

Referencia de contratos: #[[file:src/contracts/worker.ts]] y `PostureError` de #[[file:src/contracts/posture.ts]].

---

## Requisitos funcionales (notación EARS)

### RF-1 · Captura de vídeo

**Cuando** el usuario concede acceso a la cámara,
**el sistema** abrirá un stream con `getUserMedia` (resolución mínima 640×480, `facingMode: 'user'`) y bombeará frames al Web Worker usando `requestVideoFrameCallback`, limitando la cadencia a un máximo de 5 FPS comparando timestamps con `performance.now()`.

### RF-2 · Descarte de frames en vuelo

**Mientras** haya una inferencia en curso en el worker,
**el sistema** descartará cualquier frame entrante cerrando su `ImageBitmap` con `bitmap.close()` en un bloque `finally`. No se encola ningún frame.

### RF-3 · Inferencia en Web Worker

**Cuando** el worker reciba un mensaje `FRAME`,
**el sistema** ejecutará `PoseLandmarker.detectForVideo()` con el `ImageBitmap` recibido y responderá con un mensaje `LANDMARKS` conteniendo solo los 5 landmarks de `LM` (NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER), el timestamp original y el tiempo de inferencia en milisegundos.

### RF-4 · Inicialización del worker

**Cuando** el worker reciba un mensaje `INIT`,
**el sistema** cargará el modelo desde `wasmPath` y `modelPath` (rutas locales en `/public`) con configuración: modelo lite, `delegate: 'GPU'`, `runningMode: 'VIDEO'`, `numPoses: 1`. Al completarse, responderá con un mensaje `READY`.

### RF-5 · Cierre del pipeline

**Cuando** el worker reciba un mensaje `STOP`,
**el sistema** detendrá las inferencias, cerrará el `PoseLandmarker` y liberará recursos. En el hilo principal se detendrá el stream de cámara (`track.stop()`).

### RF-6 · Errores de cámara tipados

**Cuando** falle el acceso a la cámara,
**el sistema** devolverá un error tipado `PostureError`:
- `CAMERA_DENIED` si el usuario rechazó el permiso.
- `CAMERA_BUSY` si la cámara está ocupada por otra aplicación.
- `MODEL_LOAD_FAILED` (con detalle) si el modelo no carga.
- `NO_GPU` (con fallback `'cpu'`) si no hay aceleración GPU disponible.

### RF-7 · Grabación de sesiones (record)

**Cuando** el modo grabación esté activo,
**el sistema** almacenará cada respuesta `LANDMARKS` del worker en un array y, al finalizar la sesión, exportará el conjunto como un fichero JSON compatible con el formato de `fixtures/`.

### RF-8 · Reproducción de sesiones (replay)

**Cuando** se cargue un fichero de fixtures,
**el sistema** reproducirá los landmarks grabados respetando los deltas de tiempo originales, emitiendo mensajes `LANDMARKS` sin requerir cámara ni modelo. La fuente de replay implementará la interfaz `PostureSource`.

### RF-9 · Panel de rendimiento

**Mientras** el pipeline esté activo,
**el sistema** calculará y expondrá en tiempo real:
- Tiempo de inferencia: percentiles p50 y p95 (sobre una ventana deslizante).
- FPS reales de procesamiento (frames procesados por segundo).
- Número acumulado de frames descartados desde el inicio de la sesión.

---

## Requisitos no funcionales

### RNF-1 · Privacidad: cero red

El pipeline de visión (`src/vision/**`) no realizará **ninguna** petición de red: ni `fetch`, ni carga de CDN, ni telemetría. Todo asset (modelo `.task`, runtime WASM) se sirve desde `/public`.

### RNF-2 · Rendimiento: 5 FPS máximo

La inferencia se limita a 5 FPS. Frames que lleguen antes del intervalo mínimo (200 ms) se descartan sin procesarlos.

### RNF-3 · Gestión de memoria

Todo `ImageBitmap` transferido al worker se cierra con `bitmap.close()` en un bloque `finally` tras la inferencia, independientemente de si tuvo éxito o falló.

### RNF-4 · Aislamiento del hilo principal

La inferencia de MediaPipe se ejecuta **siempre** en el Web Worker (tipo módulo). Nunca en el hilo principal.

### RNF-5 · Coordenada Z descartada

Nunca se usa la coordenada `z` de los landmarks devueltos por MediaPipe. Solo se trabaja con `x`, `y` y `visibility`.

### RNF-6 · Fronteras de importación

`src/vision/` puede importar de `src/contracts/` y `src/posture/`. No puede importar de `src/game/`, `src/ui/`, `src/storage/` ni `src/store/`.

---

## Fuera de alcance

- Cálculo de métricas de postura (neckRatio, proximity, tilt, headTilt).
- Calibración de la línea base del usuario.
- Máquina de estados (GOOD/BAD/AWAY/LOW_CONF).
- Scoring y suavizado EMA.
- Cualquier lógica de juego o feedback.
