---
inclusion: fileMatch
fileMatchPattern: 'amplify/**,src/storage/**,src/store/**'
---

# Reglas de Datos y Nube (C)

## La regla que manda sobre todas las demás

**Lo único que sale del navegador es el objeto `Checkpoint` de
`src/contracts/sync.ts`**: enteros agregados y cadenas cortas.

Nunca, bajo ninguna circunstancia:

- imágenes, frames o `ImageBitmap`
- landmarks, crudos o procesados
- métricas por frame (`PostureMetrics`)
- nada que pueda considerarse dato biométrico
- correo, nombre real, IP o identificadores de dispositivo más allá del `owner`
  de Cognito

Si te encuentras diseñando un campo que no encaja en esa descripción, párate:
estás a punto de romper el diferencial de privacidad del producto.

## Modelo de datos (Amplify Gen 2)

```ts
DailyRecord {
  date: date!                  // YYYY-MM-DD
  goodPostureSeconds: integer!
  longestFlowStreak: integer   // minutos
  avgScore: integer            // 0-100
  level: integer
  xp: integer
  teamCode: string             // opcional
}
// allow.owner() para escritura
// allow.authenticated().to(['read']) para que el ranking de equipo sea legible
// índice secundario por (teamCode, date)

Streak {
  currentDays: integer!
  bestDays: integer!
  lastActiveDate: date!
}
// solo allow.owner()
```

Auth: `defineAuth` con login por email **y acceso de invitado habilitado**. La
demo no puede exigir registrarse.

## Sincronización

- Un checkpoint **cada 5 minutos**, agregando desde IndexedDB. Nunca un envío
  único al final del día: haría trivial falsificar la cifra y perdería datos si
  se cierra la pestaña.
- Reintento con backoff exponencial si falla, con un máximo de 3 intentos.
- **La aplicación debe funcionar entera sin backend.** Si la red no está, se
  sigue jugando y se sincroniza después. La nube es un extra, no una dependencia.

## Anti-trampa

Al actualizar un `DailyRecord`, valida en el servidor que

```
nuevo.goodPostureSeconds - anterior.goodPostureSeconds
  <= (ahora - anterior.updatedAt) en segundos * 1.1
```

El 10% es margen por desfases de reloj. Si se excede, rechaza la mutación con un
error explícito. Implémentalo de la forma más simple que Amplify Gen 2 permita.
No lo sobre-diseñes: son pocas líneas y su función es sostener la respuesta al
jurado, no ser a prueba de balas.

## IndexedDB

Base `spinehero`, con dos almacenes:

| Almacén | Clave | Valor |
|---|---|---|
| `minutes` | `YYYY-MM-DDTHH:mm` | score medio, estado predominante, segundos en GOOD |
| `profile` | clave fija `'me'` | nivel, XP, racha, logros, línea base de calibración |

Una entrada por minuto, no por frame. A 5 FPS, guardar cada frame serían 18.000
registros por hora: la base se hincha y las consultas del dashboard se arrastran.

## Content-Security-Policy

```
default-src 'self';
connect-src 'self' <endpoint de AppSync>;
img-src     'self' data: blob:;
worker-src  'self' blob:;
font-src    'self';
media-src   'self' blob:;
object-src  'none';
```

Va en el `<meta http-equiv>` de `index.html` **y** en las cabeceras de Amplify
(`customHttp.yml`). Es la prueba documental del argumento de privacidad: alguien
debe poder abrir el fichero y verificarlo en diez segundos.

Tras aplicarla, **vuelve a probar la aplicación entera**, sobre todo el worker
con WASM: `worker-src 'self' blob:` es el que suele faltar.

## Store

- El store **orquesta, no calcula.** Conecta la fuente de postura, llama al
  `tick()` del motor de juego y expone el resultado. Cero lógica de negocio aquí.
- Guarda la función de cancelación de la suscripción para poder llamarla en
  `stop()`. Si no, al cambiar de fuente acabas con dos suscripciones activas
  emitiendo a la vez.
- Depende de la **interfaz** `PostureSource`, nunca de una implementación
  concreta. Las tres fuentes (real, falsa y replay) deben ser intercambiables
  sin tocar el store.
