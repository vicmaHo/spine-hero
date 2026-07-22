---
inclusion: always
---

# SpineHero — Convenciones

## Código

- **TypeScript en modo `strict`.** Prohibido `any`. Si no sabes el tipo, usa
  `unknown` y estrecha con guardas de tipo.
- **Prohibido `console.log` en código que llegue a `main`.** Para depuración
  temporal, márcalo con `// DEBUG:` para poder localizarlo y borrarlo.
- **Errores tipados, no excepciones crudas.** Devuelve uniones discriminadas
  (como `PostureError`) en vez de lanzar cadenas. Lanzar solo para fallos
  verdaderamente irrecuperables.
- **Constantes de configuración arriba del fichero y exportadas.** Umbrales,
  pesos, duraciones. Nunca números mágicos incrustados en la lógica: hay que
  poder afinarlos sin tocar el algoritmo.
- **Un fichero, una responsabilidad.** Si un fichero pasa de ~200 líneas,
  probablemente hay dos cosas dentro.
- **Sin comentarios que repitan el código.** Comenta el *porqué* cuando no sea
  evidente (una fórmula, un umbral elegido empíricamente, un workaround del
  navegador). Comentarios en español.
- **Nombres:** ficheros y funciones en `camelCase`, componentes React en
  `PascalCase`, tipos e interfaces en `PascalCase`, constantes en
  `SCREAMING_SNAKE_CASE`.
- **`async`/`await`, no cadenas de `.then()`.**
- **Limpia siempre los efectos:** `useEffect` devuelve su función de limpieza,
  los `requestAnimationFrame` se cancelan, las suscripciones se cierran, los
  workers se terminan. Una fuga aquí se nota a los 10 minutos de demo.

## React

- Componentes de función con hooks. Sin clases.
- Nada de lógica de negocio dentro de componentes: vive en `game/`, `posture/`
  o `store/`.
- No metas en el store lo que sea estado local de un componente.
- Tailwind para todo el estilado. Sin ficheros CSS sueltos salvo el canvas
  pixel-art, que necesita `image-rendering: pixelated`.

## Tests

- Vitest. Fichero junto al código: `scoring.ts` → `scoring.test.ts`.
- **Todo módulo puro va acompañado de test.** `posture/` y `game/` sin tests no
  se mergean.
- Los tests de postura se ejecutan contra los ficheros de `fixtures/`, nunca
  contra datos inventados a mano.
- Los tests describen comportamiento, no implementación:
  `'no penaliza mientras el usuario está ausente'`, no `'llama a tick()'`.

## Git

- Ramas: `v/<tarea>`, `m/<tarea>`, `c/<tarea>`.
- Commits: `[V] worker: descarta frames si hay inferencia en curso`.
- Rama corta, merge el mismo día. Nada de ramas de tres días.
- `main` siempre debe compilar y arrancar. Quien la rompe, la arregla o revierte
  en 15 minutos.

## Cómo quiero que trabajes conmigo (instrucciones para el agente)

1. **Una tarea cada vez.** No implementes un módulo entero de una tacada aunque
   te lo pueda parecer más eficiente. Genera código que yo pueda revisar en un
   diff razonable.
2. **No reescribas ficheros enteros para arreglar un síntoma.** Haz el cambio
   mínimo que resuelva el problema.
3. **Si algo no funciona, explica primero tu hipótesis** en dos o tres líneas
   antes de tocar código. Si no estás seguro, añade instrumentación temporal y
   dime qué mirar.
4. **No añadas dependencias npm sin preguntar.**
5. **No inventes tipos.** Si falta uno en `src/contracts/`, párate y avísalo.
6. **No toques ficheros fuera del módulo en el que estamos trabajando.** Si
   detectas que hace falta un cambio en otra carpeta, dilo en lugar de hacerlo.
7. **No añadas funcionalidad que no te he pedido**: ni gestión de errores para
   casos imposibles, ni abstracciones para necesidades futuras hipotéticas, ni
   refactores del código de alrededor. Estamos en un hackathon de 6 días; lo
   simple que funciona gana.
8. Cuando termines, dime en una línea **qué debo comprobar** para saber que
   funciona.
