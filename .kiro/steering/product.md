---
inclusion: always
---

# SpineHero — Producto

## Qué es

Aplicación web que mide la postura del usuario con la webcam **procesando todo
localmente en el navegador** (cero vídeo o landmarks enviados a la red) y
convierte esa señal en la mecánica de un tamagotchi pixel-art que vive en una
**ventana flotante siempre visible sobre el IDE**.

Proyecto de hackathon. Plazo: 6 días. Equipo de 3 personas (V, M, C).

## Para quién

Programadores y trabajadores remotos que pasan 8-10 h al día frente a una
pantalla. El usuario **no está mirando nuestra aplicación**: está en su editor de
código. Cualquier retroalimentación que exija mirar una pestaña del navegador es
retroalimentación que nunca se ve. Ésta es la restricción de diseño más
importante del producto.

## Los cuatro diferenciales

Cuando propongas una solución técnica, protégelos. Si una alternativa es más
sencilla pero rompe uno de estos, dilo explícitamente antes de proponerla.

1. **Ventana flotante sobre el IDE** mediante `Document Picture-in-Picture API`.
   Es lo que hace que el producto sirva para algo real.
2. **Privacidad demostrable, no declarada.** El modelo y el WASM se sirven desde
   `/public`, la CSP restringe `connect-src` al propio origen, y la aplicación
   funciona con el WiFi desconectado. Debe poder demostrarse en directo.
3. **Calibración personal + histéresis.** Nada de ángulos absolutos: ratios
   normalizados contra una línea base del propio usuario, con umbrales distintos
   de entrada y salida para evitar el parpadeo de estado.
4. **Rendimiento medido, no afirmado.** Panel visible con ms por inferencia
   (p50/p95), FPS reales y frames descartados.

## Bucle de producto

```
Buena postura → sube XP y la barra de Flow → la mascota está contenta
Mala postura  → baja HP, la mascota se marchita, sonido 8-bit descendente
Ausente       → TODO se congela; no se penaliza al usuario por levantarse
```

## No-objetivos (no los implementes aunque parezcan una mejora obvia)

- Soporte móvil o táctil. Es una herramienta de escritorio.
- Entrenamiento de modelos propios. Usamos MediaPipe tal cual.
- Procesamiento de vídeo en servidor. **Nunca. Bajo ninguna circunstancia.**
- Login social, recuperación de contraseña, perfiles ricos. Identidad de
  invitado de Cognito y ya.
- Ranking global. Solo ranking por código de equipo.
- Analítica de terceros, telemetría, Sentry, Google Analytics. Cualquier
  petición saliente que no sea a AppSync rompe el diferencial 2.
- Internacionalización. La interfaz va en español.
- Modo oscuro/claro configurable. Un solo tema, oscuro.

## Criterios por los que se nos evalúa

| Peso | Criterio | Dónde lo ganamos |
|---|---|---|
| 30% | Impacto tecnológico | Salud ocupacional en empresas de software |
| 30% | Innovación, rendimiento, consumo de recursos | Inferencia local a 5 FPS en worker + benchmarks visibles |
| 30% | Software funcional y entregables | Demo en línea + repo + vídeo de 3 min |
| 10% | Uso de AWS y Kiro | Amplify Hosting + DynamoDB + specs/steering/hooks de Kiro |
