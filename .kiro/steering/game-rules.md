---
inclusion: fileMatch
fileMatchPattern: 'src/game/**,src/feedback/**,src/pip/**'
---

# Reglas del módulo de Juego y Feedback (M)

## Separación estricta

| Carpeta | Qué puede hacer |
|---|---|
| `src/game/**` | **Funciones puras.** Sin DOM, sin canvas, sin audio, sin `Date.now()` interno (el tiempo entra por parámetro). Debe poder testearse en Node. |
| `src/feedback/**` | Todo lo que toca canvas, Web Audio y Notification API |
| `src/pip/**` | La ventana Document Picture-in-Picture |

**Nunca importes desde `src/vision/` ni `src/posture/`.** Este módulo no sabe
que existe una cámara: consume `PostureFrame` y punto.

## Motor de juego

Firma única: `tick(state: GameState, frame: PostureFrame, now: number): TickResult`.

### La regla más importante

**En `AWAY` y `LOW_CONF` se congela absolutamente todo.** No sube XP, no baja HP,
no avanza el Flow, no se rompen rachas. El usuario se levantó al baño; penalizarlo
por eso es el error que convierte la aplicación en algo que se desinstala.

### Reglas de puntuación

```ts
export const XP_PER_MINUTE_GOOD = 10;
export const HP_LOSS_ON_ENTER_BAD = 5;
export const HP_LOSS_PER_10S_BAD = 1;
export const LEVEL_XP = (level: number) => Math.floor(100 * level ** 1.5);
export const FLOW_MILESTONES_MIN = [25, 50, 90];
export const REVIVE_HP = 20;
export const MS_GOOD_TO_REVIVE = 5 * 60 * 1000;
```

- Al **entrar** en BAD: −5 HP y el Flow se reinicia a 0.
- Mientras siga en BAD: −1 HP por cada 10 s adicionales.
- HP a 0 → `mood: 'faint'` + evento `FAINTED`. Revive con 20 HP tras 5 minutos
  continuados en GOOD.
- Logros: `espalda-de-acero` (25 min de Flow), `lord-clean-code` (90 min),
  `constante` (3 días de racha).

Los eventos se **emiten**, no se ejecutan. El motor devuelve `GameEvent[]`; quien
decide reproducir un sonido o lanzar una notificación es `feedback/`.

## Sprite y canvas

- Sheet único en `/sprites/hero.png`: **1024×128, ocho frames de 128×128** en
  este orden fijo, no lo cambies:
  `idle0, idle1, happy0, happy1, sad0, sad1, faint0, faint1`.
- Paleta de exactamente 8 colores. Anótalos en un comentario del componente.
- Renderiza a tamaño nativo (128×128) o escala con `ctx.imageSmoothingEnabled =
  false` **y** `image-rendering: pixelated` en el CSS del canvas. Las dos cosas:
  una sola no basta en todos los navegadores.
- Alternancia entre los dos frames del estado cada 500 ms.
- Tinte global según el estado con `globalCompositeOperation = 'multiply'`.
- Fuente **Press Start 2P auto-alojada** en `/fonts/`. Nunca desde Google Fonts.
- Un único `requestAnimationFrame` por componente, cancelado en la limpieza del
  `useEffect`.

## Audio

- **Todo sintetizado. Cero ficheros de audio.**
- `AudioContext` **perezoso**: créalo en el primer gesto del usuario, nunca al
  importar el módulo, o los navegadores lo bloquearán y no sonará nada.
- Todo el volumen pasa por un único `GainNode` maestro para poder silenciar de
  golpe.
- Envolvente ADSR corta: ataque 5 ms, decay 30 ms, sustain 0.3, release 50 ms.
  Sin envolvente, los osciladores chasquean.
- Onda `square` para el carácter 8-bit.

## Ventana Document Picture-in-Picture

Cuatro cosas fallan siempre. Si estás escribiendo este código, comprueba las cuatro:

1. **`requestWindow()` exige un gesto del usuario.** Llámalo dentro de un
   manejador de `click`, nunca en un `useEffect` ni tras un `await` largo.
2. **La ventana tiene su propio `document` y no hereda ningún CSS.** Hay que
   copiar los estilos explícitamente: recorre `document.styleSheets` y replica
   cada hoja en el documento destino (para las que tengan `href` y den error de
   CORS al leer `cssRules`, inserta un `<link>` en su lugar). Si te saltas esto,
   la ventana sale sin estilar y parece que está rota.
3. **Comprueba `'documentPictureInPicture' in window`** y cae a
   `window.open('', '', 'width=320,height=200,popup=yes')` si no existe. Firefox
   y Safari no la soportan.
4. **Escucha `pagehide` en la ventana PiP** para desmontar el portal y
   actualizar el estado. Si no, al cerrarla la aplicación se queda creyendo que
   sigue abierta.

El contenido de la ventana recibe el estado **por props a través del portal**.
No abras una suscripción independiente dentro: tendrías dos fuentes de verdad.
