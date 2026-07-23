# Requirements Document

## Introduction

SpineHero procesa la postura del usuario 100% en local. Esta especificación cubre la capa de persistencia en la nube mediante AWS Amplify Gen 2, con una restricción innegociable: lo único que sale del navegador es el objeto `Checkpoint` de `src/contracts/sync.ts`, compuesto exclusivamente por enteros agregados y cadenas cortas. Nunca imágenes, nunca landmarks, nunca métricas por frame, nunca datos biométricos.

La nube es un complemento opcional: la aplicación funciona entera sin backend y sincroniza cuando hay conectividad.

## Glossary

- **Sistema_Auth**: Módulo de autenticación de Amplify Gen 2 configurado con `defineAuth`. Gestiona login por email y acceso de invitado.
- **Sistema_Data**: Módulo de datos de Amplify Gen 2 configurado con `defineData`. Gestiona los modelos DynamoDB vía AppSync.
- **Checkpoint**: Objeto definido en `src/contracts/sync.ts` que contiene exclusivamente enteros agregados (goodPostureSeconds, longestFlowStreak, avgScore, level, xp) y cadenas cortas (date, teamCode). Es lo único que abandona el navegador.
- **DailyRecord**: Modelo de DynamoDB que almacena las estadísticas agregadas de un día para un usuario.
- **Streak**: Modelo de DynamoDB que almacena la racha de días consecutivos de un usuario.
- **Sincronizador**: Componente de `src/storage/` que agrega datos de IndexedDB en un Checkpoint y lo envía al backend.
- **Validador_AntiTrampa**: Lógica del lado servidor que verifica la plausibilidad temporal de las actualizaciones.
- **IndexedDB_Local**: Base de datos local del navegador donde se persisten los datos de sesión (minutos y perfil).
- **Ranking_Equipo**: Vista que lista los miembros de una sala ordenados por goodPostureSeconds del día actual.
- **TeamCode**: Cadena corta (4-20 caracteres alfanuméricos) que identifica una sala de equipo para el ranking grupal.

## Requirements

### Requisito 1: Autenticación con Amplify Gen 2

**User Story:** Como usuario, quiero poder acceder a la sincronización en la nube con mi email o como invitado, para no necesitar registrarme obligatoriamente en una demo.

#### Criterios de Aceptación

1. THE Sistema_Auth SHALL configurar `defineAuth` de Amplify Gen 2 con login por email y contraseña como método de autenticación principal.
2. THE Sistema_Auth SHALL habilitar el acceso de invitado (identidad no autenticada de Cognito) para permitir el uso de la aplicación sin registro.
3. WHEN un usuario inicia sesión con email y contraseña válidos, THE Sistema_Auth SHALL devolver credenciales que permitan crear, leer y actualizar registros Checkpoint propios en Sistema_Data, y leer registros TeamEntry de cualquier equipo.
4. WHEN un usuario accede como invitado, THE Sistema_Auth SHALL conceder credenciales con permiso exclusivamente de lectura sobre los registros TeamEntry en Sistema_Data, sin permiso de escritura ni lectura sobre registros Checkpoint.
5. IF el inicio de sesión con email falla por credenciales incorrectas o usuario inexistente, THEN THE Sistema_Auth SHALL denegar el acceso, no emitir credenciales, y devolver un error que indique el motivo del fallo de autenticación.
6. WHEN un usuario autenticado intenta crear o actualizar un registro Checkpoint, THE Sistema_Auth SHALL permitir la operación únicamente si el owner del registro coincide con la identidad del usuario autenticado.

### Requisito 2: Modelo DailyRecord

**User Story:** Como usuario registrado, quiero que mis estadísticas diarias se persistan en la nube, para poder acceder a ellas desde cualquier dispositivo y participar en rankings de equipo.

#### Criterios de Aceptación

1. THE Sistema_Data SHALL definir el modelo DailyRecord con los campos: date (tipo date, formato YYYY-MM-DD, requerido), goodPostureSeconds (tipo integer, rango 0–86400, requerido), longestFlowStreak (tipo integer, valor en minutos, rango 0–1440), avgScore (tipo integer, rango 0–100), level (tipo integer, mínimo 1), xp (tipo integer, mínimo 0) y teamCode (tipo string, longitud máxima 20 caracteres, opcional).
2. THE Sistema_Data SHALL configurar la autorización de DailyRecord con `allow.owner()` para operaciones de creación, actualización y borrado, de modo que cada registro quede vinculado al usuario autenticado de Cognito que lo creó.
3. THE Sistema_Data SHALL configurar la autorización de DailyRecord con `allow.authenticated().to(['read'])` para permitir que cualquier usuario autenticado pueda leer registros de otros usuarios (necesario para consultar el ranking por equipo).
4. THE Sistema_Data SHALL definir un índice secundario en DailyRecord con partition key `teamCode` y sort key `date` para permitir consultas de ranking filtradas por equipo y ordenadas por fecha.
5. IF un usuario sincroniza un Checkpoint para una fecha que ya tiene un registro DailyRecord existente del mismo owner, THEN THE Sistema_Data SHALL sobrescribir (upsert) el registro existente en lugar de crear un duplicado.

### Requisito 3: Modelo Streak

**User Story:** Como usuario registrado, quiero que mi racha de días consecutivos se persista en la nube, para no perderla si cambio de dispositivo.

#### Criterios de Aceptación

1. THE Sistema_Data SHALL definir el modelo Streak con los campos: currentDays (tipo integer, requerido, valor por defecto 0, rango 0 a 365), bestDays (tipo integer, requerido, valor por defecto 0, rango 0 a 365) y lastActiveDate (tipo string en formato ISO 8601 YYYY-MM-DD, requerido).
2. THE Sistema_Data SHALL configurar la autorización de Streak exclusivamente con `allow.owner()` para todas las operaciones (create, read, update, delete).
3. WHEN un usuario autenticado no posee un registro Streak, THE Sistema_Data SHALL crear uno con currentDays igual a 0, bestDays igual a 0 y lastActiveDate igual a la fecha actual en formato YYYY-MM-DD.
4. WHEN el sistema sincroniza y lastActiveDate es igual a la fecha de ayer, THE Sistema_Data SHALL incrementar currentDays en 1 y actualizar lastActiveDate a la fecha actual; IF currentDays supera bestDays, THEN THE Sistema_Data SHALL actualizar bestDays al valor de currentDays.
5. IF el sistema sincroniza y lastActiveDate es anterior a la fecha de ayer, THEN THE Sistema_Data SHALL restablecer currentDays a 1 y actualizar lastActiveDate a la fecha actual, preservando el valor de bestDays.

### Requisito 4: Sincronización periódica de Checkpoint

**User Story:** Como usuario, quiero que mis datos se sincronicen automáticamente con la nube cada 5 minutos, para tener persistencia sin intervención manual.

#### Criterios de Aceptación

1. WHILE el usuario tiene sesión autenticada en Cognito y `navigator.onLine` es `true`, THE Sincronizador SHALL enviar un Checkpoint al Sistema_Data cada 300 segundos (±5 segundos de tolerancia del timer).
2. WHEN llega el momento de sincronizar, THE Sincronizador SHALL construir un objeto Checkpoint agregando los datos del día actual (fecha en formato YYYY-MM-DD) desde IndexedDB_Local: sumar `goodSeconds` de todas las entradas del día para `goodPostureSeconds`, calcular la media aritmética de `avgScore` de las entradas para `avgScore`, y tomar `level`, `xp` y `longestFlowStreak` del perfil almacenado.
3. IF un envío de Checkpoint falla, THEN THE Sincronizador SHALL reintentar con backoff exponencial (base 1 segundo, factor ×2: 1 s, 2 s, 4 s) hasta un máximo de 3 intentos, preservando el Checkpoint en memoria hasta que se confirme el envío o se agoten los reintentos.
4. WHEN los 3 reintentos se agotan sin éxito, THE Sincronizador SHALL descartar el intento actual sin eliminar los datos de IndexedDB_Local y esperar al próximo ciclo de 300 segundos para generar y enviar un nuevo Checkpoint.
5. THE Sincronizador SHALL enviar exclusivamente campos del tipo `Checkpoint` definido en `src/contracts/sync.ts`: date (string YYYY-MM-DD), goodPostureSeconds (number), longestFlowStreak (number), avgScore (number 0-100), level (number), xp (number) y teamCode (string opcional).
6. WHEN `navigator.onLine` cambia de `false` a `true` mientras el usuario tiene sesión autenticada, THE Sincronizador SHALL ejecutar un envío de Checkpoint inmediato sin esperar al próximo ciclo de 300 segundos.

### Requisito 5: Validación anti-trampa en el servidor

**User Story:** Como operador del sistema, quiero que el servidor rechace actualizaciones implausibles de goodPostureSeconds, para evitar trampas en el ranking de equipo.

#### Criterios de Aceptación

1. WHEN el Sistema_Data recibe una mutación de actualización de DailyRecord que incluye un valor de goodPostureSeconds, THE Validador_AntiTrampa SHALL calcular el incremento comparando el nuevo valor con el valor de goodPostureSeconds almacenado en el registro existente para la misma fecha y usuario.
2. IF el incremento de goodPostureSeconds supera los segundos reales transcurridos desde el campo updatedAt del registro anterior más un margen del 10%, THEN THE Validador_AntiTrampa SHALL rechazar la mutación con un mensaje de error que indique que el incremento excede el tiempo transcurrido permitido.
3. IF no existe un registro previo de DailyRecord para la misma fecha y usuario (primera escritura del día), THEN THE Validador_AntiTrampa SHALL aceptar la mutación siempre que el valor de goodPostureSeconds no supere 86 400.
4. IF el valor de goodPostureSeconds en la mutación supera 86 400, THEN THE Validador_AntiTrampa SHALL rechazar la mutación independientemente del tiempo transcurrido, con un mensaje de error que indique que el valor excede el máximo diario permitido.
5. THE Validador_AntiTrampa SHALL ejecutarse como pipeline resolver o función Lambda adjunta a la mutación de DailyRecord en Amplify Gen 2, de modo que la validación ocurra antes de que el dato se persista en DynamoDB.

### Requisito 6: Ranking por código de equipo

**User Story:** Como usuario, quiero introducir un código de sala y ver un ranking de los miembros de esa sala ordenados por goodPostureSeconds del día, para competir amigablemente con mi equipo.

#### Criterios de Aceptación

1. THE Ranking_Equipo SHALL presentar un campo de texto donde el usuario introduce un TeamCode de entre 4 y 20 caracteres alfanuméricos (letras ASCII y dígitos, sin espacios ni caracteres especiales).
2. WHEN el usuario introduce un TeamCode que coincide con un código existente en el backend, THE Ranking_Equipo SHALL consultar los DailyRecord del día actual (fecha local YYYY-MM-DD) que tengan ese TeamCode y mostrar la lista en un máximo de 3 segundos tras el envío.
3. THE Ranking_Equipo SHALL listar los miembros de la sala ordenados de mayor a menor por goodPostureSeconds del día, mostrando para cada entrada: displayName, goodPostureSeconds (formateado como HH:MM:SS), level y streakDays según la interfaz TeamEntry.
4. IF el TeamCode introducido no existe en el backend o no tiene miembros con datos para el día actual, THEN THE Ranking_Equipo SHALL mostrar un mensaje indicando que no se encontraron resultados para ese código.
5. WHEN el usuario tiene un TeamCode asignado en su perfil local, THE Sincronizador SHALL incluir dicho TeamCode en el campo `teamCode` de cada Checkpoint enviado al backend.

### Requisito 7: Funcionamiento offline-first

**User Story:** Como usuario, quiero seguir usando la aplicación sin conexión a internet, para que la nube sea un extra y no una dependencia.

#### Criterios de Aceptación

1. WHILE no hay conexión a internet, THE aplicación SHALL mantener operativos sin degradación la detección de postura (inferencia en Web Worker), el motor de juego (tick sobre GameState) y la persistencia local (escrituras en IndexedDB_Local).
2. WHEN la conexión a internet se restablece tras un periodo offline, THE Sincronizador SHALL enviar un Checkpoint con los datos acumulados en IndexedDB_Local durante la desconexión en un plazo máximo de 10 segundos tras la detección de reconexión (`navigator.onLine` pasa a `true`).
3. IF el módulo de Amplify no puede inicializarse al arrancar la aplicación (error de red, timeout, o SDK no cargado), THEN THE aplicación SHALL continuar operando en modo exclusivamente local sin mostrar errores bloqueantes al usuario ni impedir la interacción con la UI.
4. THE aplicación SHALL cargar y ejecutar todas las funcionalidades de detección de postura y juego sin requerir ninguna respuesta del backend de Amplify: el arranque de la cámara, la inferencia, el cálculo de score y la actualización de GameState se ejecutan íntegramente con recursos locales.

### Requisito 8: Privacidad — restricción de datos salientes

**User Story:** Como usuario, quiero tener garantía verificable de que ningún frame de vídeo ni landmark sale de mi navegador, para confiar en la privacidad del producto.

#### Criterios de Aceptación

1. THE aplicación SHALL restringir los datos transmitidos a la red exclusivamente a instancias del objeto `Checkpoint` definido en `src/contracts/sync.ts`, conteniendo únicamente los campos `date` (cadena YYYY-MM-DD), `goodPostureSeconds` (entero), `longestFlowStreak` (entero, minutos), `avgScore` (entero 0-100), `level` (entero), `xp` (entero) y opcionalmente `teamCode` (cadena, máximo 20 caracteres).
2. THE aplicación SHALL garantizar que ningún frame de vídeo, ImageBitmap, dato de píxeles, array de landmarks, coordenadas de pose ni dato biométrico crudo se transmita a través de la red; verificable mediante inspección de la pestaña Network de DevTools durante una sesión completa de al menos 60 segundos con la detección activa, donde todas las peticiones salientes corresponden exclusivamente al endpoint de AppSync.
3. THE aplicación SHALL garantizar que ninguna métrica por frame individual (`PostureFrame`, `PostureMetrics`) se transmita a través de la red; solo se permiten los agregados diarios contenidos en `Checkpoint`.
4. THE aplicación SHALL configurar una cabecera `Content-Security-Policy` con la directiva `connect-src` restringida a `'self'` y al endpoint de AppSync de Amplify (obtenido de la configuración de Amplify Gen 2 en tiempo de build), bloqueando cualquier otra conexión saliente.
5. THE aplicación SHALL configurar la directiva `default-src 'self'` en el Content-Security-Policy para impedir la exfiltración de datos a través de canales alternativos como `img-src`, `media-src` o `form-action` a orígenes no autorizados.
6. WHEN la aplicación se ejecuta sin conexión a internet, THE aplicación SHALL seguir funcionando en su totalidad (detección de postura, juego y persistencia local) sin errores, confirmando que ningún recurso externo es necesario para la operación del pipeline de detección.
