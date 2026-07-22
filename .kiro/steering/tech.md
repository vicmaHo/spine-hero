---
inclusion: always
---

# SpineHero — Stack y reglas técnicas

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Build | Vite + React 19 + TypeScript (modo `strict`) | |
| Estilos | Tailwind CSS v4 vía `@tailwindcss/vite` | Sin `tailwind.config.js` salvo necesidad real |
| Estado | Zustand | Un único store en `src/store/useAppStore.ts` |
| Visión | `@mediapipe/tasks-vision` → `PoseLandmarker` | Modelo **lite**, `delegate: 'GPU'`, `runningMode: 'VIDEO'`, `numPoses: 1` |
| Concurrencia | Web Worker de tipo módulo + `ImageBitmap` transferible | |
| Render del avatar | Canvas 2D nativo | **Sin PixiJS, Three.js ni motores gráficos** |
| Audio | Web Audio API (`OscillatorNode` + `GainNode`) | **Sin ficheros de audio** |
| Flotante | `documentPictureInPicture.requestWindow()` | Fallback a `window.open()` |
| Persistencia local | IndexedDB vía `idb` | |
| PWA | `vite-plugin-pwa` | |
| Tests | Vitest (+ `jsdom` cuando haga falta DOM) | |
| Hosting | AWS Amplify Hosting | Despliegue automático desde `main` |
| Backend | Amplify Gen 2 (`defineAuth` + `defineData`) → AppSync → DynamoDB | |

## Comandos

```bash
npm run dev        # desarrollo en localhost:5173
npm run build      # comprueba tipos + build de producción
npm run preview    # sirve el build (necesario para probar PWA y CSP)
npm test           # Vitest en modo watch
npm test -- run    # Vitest una sola pasada (CI)
npx ampx sandbox   # backend de Amplify en modo desarrollo
```

## Reglas duras

Estas no son preferencias. Romper cualquiera de ellas invalida un diferencial
del producto o rompe la demo.

### Privacidad

1. **Cero peticiones de red desde el pipeline de detección.** Ni telemetría, ni
   CDN, ni fuentes remotas, ni `fetch` de ningún tipo dentro de
   `src/vision/**` o `src/posture/**`.
2. **Todos los assets de MediaPipe se sirven desde `/public`**:
   `public/models/pose_landmarker_lite.task` y `public/wasm/`. Nunca desde
   `cdn.jsdelivr.net`, `storage.googleapis.com` ni ningún otro origen externo.
   Si generas código con una URL de CDN, es un error, no un atajo.
3. **Las fuentes web se auto-alojan** en `public/fonts/`. Nada de Google Fonts.
4. **Lo único que sale del navegador** es el objeto `Checkpoint` de
   `src/contracts/sync.ts`: enteros agregados. Nunca imágenes, nunca landmarks,
   nunca datos biométricos crudos.

### Rendimiento

5. **Inferencia limitada a 5 FPS.** La postura no cambia en 33 ms. Descarta
   frames comparando `performance.now()`, no proceses todos los que llegan.
6. **La inferencia va siempre en el Web Worker.** Nunca en el hilo principal.
7. **Si llega un frame mientras se procesa el anterior, se descarta** (y se
   cierra su `ImageBitmap`). No se encola: preferimos perder frames a acumular
   latencia.
8. **Cierra siempre los `ImageBitmap`** con `bitmap.close()` en un bloque
   `finally`. Si no, la pestaña se come la memoria en minutos.

### Visión

9. **Nunca uses la coordenada `z` de MediaPipe.** Es ruidosa a distancia de
   escritorio (~50 cm). Todo se calcula con ratios 2D.
10. **Todas las métricas se normalizan por `shoulderWidth`** para ser
    invariantes a la distancia del usuario a la cámara.

### Dependencias

11. **No añadas ninguna dependencia npm sin preguntar primero.** Cada paquete es
    peso de bundle, superficie de ataque y una posible petición de red. Si crees
    que hace falta una, párate y propónla con su justificación.

## Compatibilidad objetivo

Chrome y Edge de escritorio, versión 116 o superior (requisito de Document
Picture-in-Picture). Firefox y Safari deben **degradar sin romperse**: la
ventana flotante cae al fallback y el resto funciona igual.
