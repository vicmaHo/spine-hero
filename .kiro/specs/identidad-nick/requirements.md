# Requirements Document

## Introduction

El login actual de Amplify (email + contraseña de Cognito) funciona, pero introduce demasiada fricción para un producto que se prueba en 30 segundos durante una demo. Esta especificación sustituye la identidad visible del usuario por un **nick sin contraseña**: el usuario escribe un nick, el sistema comprueba que nadie lo tenga, lo guarda en una tabla nueva de DynamoDB y lo persiste en IndexedDB para que no vuelva a pedírselo.

Para limitar la creación masiva de nicks por una misma persona, la primera alta pide además un **correo electrónico** que queda vinculado al nick: un correo ya usado no puede dar de alta un segundo nick.

La identidad pasa a residir en la nueva tabla `UserIdentity`, **no en Cognito**. El nick es el nombre que aparece en el ranking por código de equipo (`TeamEntry.displayName`) y el que se escribe en los `DailyRecord` que se sincronizan, junto al `teamCode`.

Cognito deja de ser fuente de identidad de usuario y se queda **solo como emisor de las credenciales de invitado** que ya existen para hablar con AppSync. En consecuencia, `DailyRecord` retira `allow.owner()`: ningún registro queda vinculado a una cuenta de Cognito. La defensa contra valores falseados deja de apoyarse en quién escribe y pasa a ser una **validación de rangos y coherencia del lado servidor** sobre los enteros del `Checkpoint` (Requisito 13). El login por email y contraseña se retira de la interfaz y la definición de usuario de la especificación `backend-nube` queda sustituida por esta (Requisito 14).

Este esquema **no autentica a nadie**: cualquiera que conozca un nick ajeno puede entrar con él y, al no haber propiedad por Cognito, cualquier cliente invitado puede sobrescribir el `DailyRecord` del día de otro nick. Es una decisión consciente, proporcional a un ranking amistoso de hackathon con datos no sensibles (segundos de buena postura, nivel, XP), y queda documentada como limitación en el Requisito 10 en lugar de disimularse.

## Glossary

- **Sistema_Identidad**: Módulo de `src/storage/` responsable de crear, consultar, cambiar y persistir la identidad basada en nick. Es el único que habla con la tabla `UserIdentity`.
- **Nick**: Cadena de 3 a 16 caracteres formada por letras ASCII (`A-Z`, `a-z`), dígitos (`0-9`), guion bajo (`_`) y guion (`-`). Es el nombre visible del usuario en el ranking.
- **Nick_Normalizado**: El Nick convertido a minúsculas ASCII. Es la clave con la que se comprueba la unicidad.
- **Correo_Vinculado**: Dirección de correo electrónico de 6 a 254 caracteres introducida en el alta de un Nick, normalizada a minúsculas ASCII y sin espacios en los extremos. Sirve exclusivamente para limitar el número de Nick por persona.
- **UserIdentity**: Modelo de datos de Amplify Gen 2 (tabla DynamoDB vía AppSync) que almacena un Nick, su Nick_Normalizado y su Correo_Vinculado.
- **Formulario_Acceso**: Componente de `src/ui/` que solicita el Nick (y el Correo_Vinculado en el alta) antes de dar paso al Dashboard.
- **Almacen_Local_Identidad**: Registro en IndexedDB (vía `idb`) donde se persiste el Nick concedido y el identificador de su registro `UserIdentity`.
- **Sistema_Data**: Módulo de datos de Amplify Gen 2 definido con `defineData` en `amplify/data/resource.ts`.
- **Sincronizador**: Componente `src/storage/synchronizer.ts` que envía el `Checkpoint` del día y lo persiste como `DailyRecord`.
- **DailyRecord**: Modelo de datos existente con las estadísticas agregadas de un día, que ya incluye el campo `displayName`.
- **Ranking_Equipo**: Panel de `src/ui/RankingPanel.tsx` que lista los `DailyRecord` del día de un `TeamCode` ordenados por `goodPostureSeconds`.
- **TeamCode**: Cadena de 4 a 20 caracteres alfanuméricos que identifica una sala de equipo para el ranking.
- **IndexedDB_Local**: Base de datos local del navegador (`spinehero`) gestionada en `src/storage/db.ts`.
- **Credenciales_Invitado**: Credenciales de identidad no autenticada de Cognito emitidas por el identity pool del proyecto, las únicas que la aplicación usa para hablar con AppSync. Se habilitan con `allow.guest()` en las reglas de autorización de los modelos.
- **Validador_AntiTrampa**: Función Lambda de `amplify/data/anti-cheat-handler/handler.ts`, adjunta a la mutación personalizada `validateAndUpdateDailyRecord` de `amplify/data/resource.ts`, que decide si una escritura de DailyRecord se persiste. Prefija sus mensajes de rechazo con el token `ANTICHEAT_REJECT`.

## Requirements

### Requisito 1: Alta de identidad con nick y correo

**User Story:** Como usuario nuevo, quiero entrar escribiendo solo un nick y un correo, para empezar a usar la aplicación sin crear una contraseña.

#### Criterios de Aceptación

1. WHEN la aplicación arranca y el Almacen_Local_Identidad no contiene un Nick, THE Formulario_Acceso SHALL mostrarse con un campo de Nick y un campo de Correo_Vinculado, y THE Sistema_Identidad SHALL impedir el acceso al Dashboard hasta que exista un registro UserIdentity asociado a esta sesión.
2. THE Formulario_Acceso SHALL aceptar como Nick válido, tras eliminar los espacios de los extremos, una cadena de 3 a 16 caracteres compuesta exclusivamente por letras ASCII, dígitos, guion bajo y guion.
3. THE Sistema_Identidad SHALL calcular el Nick_Normalizado convirtiendo el Nick a minúsculas ASCII, y SHALL conservar el Nick tal como el usuario lo escribió para mostrarlo en la interfaz.
4. THE Sistema_Identidad SHALL calcular el Correo_Vinculado eliminando los espacios de los extremos y convirtiendo la cadena a minúsculas ASCII, y SHALL aceptar como válida una longitud de 6 a 254 caracteres.
5. WHEN el usuario envía un Nick válido y un Correo_Vinculado válido, y no existe ningún registro UserIdentity con ese Nick_Normalizado ni con ese Correo_Vinculado, THE Sistema_Identidad SHALL crear un registro UserIdentity con ambos valores, SHALL guardar el Nick y el identificador de ese registro en el Almacen_Local_Identidad y SHALL conceder el acceso al Dashboard en un plazo máximo de 3 segundos desde el envío.
6. IF el usuario envía un Nick que no cumple el patrón del criterio 2, THEN THE Formulario_Acceso SHALL mostrar el mensaje «El nick debe tener entre 3 y 16 caracteres: letras, números, guion o guion bajo», SHALL mantener el registro sin crear y SHALL conservar los valores escritos en los campos.
7. IF el usuario envía un Correo_Vinculado que no cumple el patrón `texto@dominio.tld` (al menos un carácter antes de `@`, al menos un punto en el dominio y al menos dos caracteres tras el último punto) o que excede los 254 caracteres, THEN THE Formulario_Acceso SHALL mostrar el mensaje «Introduce un correo electrónico válido», SHALL mantener el registro sin crear y SHALL conservar los valores escritos en los campos.
8. IF ya existe un registro UserIdentity con el Nick_Normalizado enviado, THEN THE Formulario_Acceso SHALL mostrar el mensaje «Ese nick ya está en uso, prueba otro» en un plazo máximo de 3 segundos desde el envío, SHALL mantener el registro sin crear y SHALL no escribir nada en el Almacen_Local_Identidad.
9. IF ya existe un registro UserIdentity con el Correo_Vinculado enviado, THEN THE Formulario_Acceso SHALL rechazar el alta según el Requisito 3 criterio 2 en un plazo máximo de 3 segundos desde el envío y SHALL no escribir nada en el Almacen_Local_Identidad.
10. IF la creación del registro UserIdentity falla por un error de red o del backend, o no se completa en 3 segundos, THEN THE Formulario_Acceso SHALL informar del fallo según el Requisito 8 criterio 7, SHALL conservar los valores escritos en los campos, SHALL no escribir nada en el Almacen_Local_Identidad y SHALL no conceder el acceso al Dashboard.
11. WHILE un envío del Formulario_Acceso está en curso, THE Formulario_Acceso SHALL deshabilitar el botón de envío para que un mismo envío no genere más de un registro UserIdentity.

### Requisito 2: Acceso con un nick existente sin contraseña

**User Story:** Como usuario que ya tiene nick, quiero entrar escribiendo solo mi nick, para no repetir el correo ni recordar contraseñas.

#### Criterios de Aceptación

1. THE Formulario_Acceso SHALL ofrecer dos modos mutuamente excluyentes y seleccionables por el usuario: «Ya tengo nick», que solicita únicamente el Nick, y «Crear nick», que solicita Nick y Correo_Vinculado, siendo «Crear nick» el modo activo inicial cuando el Almacen_Local_Identidad no contiene un Nick.
2. WHILE el modo activo es «Ya tengo nick», THE Formulario_Acceso SHALL presentar un único campo de entrada, el del Nick, sin campo de contraseña ni de correo.
3. WHEN el usuario envía en modo «Ya tengo nick» un Nick que cumple el patrón del Requisito 1 criterio 2 y existe un registro UserIdentity cuyo Nick_Normalizado coincide con el del Nick enviado, THE Sistema_Identidad SHALL conceder el acceso al Dashboard en un plazo máximo de 3 segundos desde el envío, SHALL adoptar como identidad activa el Nick tal como está almacenado en ese registro (no como lo escribió el usuario) y SHALL persistir la identidad según el Requisito 4.
4. IF el usuario envía en modo «Ya tengo nick» un Nick cuyo Nick_Normalizado no existe en ningún registro UserIdentity, THEN THE Formulario_Acceso SHALL mostrar el mensaje «Ese nick no está registrado» en un plazo máximo de 3 segundos desde el envío, SHALL mantener el modo «Ya tengo nick» activo sin crear ningún registro UserIdentity ni escribir en el Almacen_Local_Identidad, y SHALL ofrecer un control que cambie al modo «Crear nick» conservando el Nick introducido.
5. THE Sistema_Identidad SHALL conceder el acceso en modo «Ya tengo nick» basándose exclusivamente en la existencia de un registro UserIdentity con ese Nick_Normalizado, sin solicitar ni comprobar contraseña, correo, código de verificación ni ningún otro factor de autenticación (limitación declarada en el Requisito 10).
6. WHEN el usuario alterna entre los modos «Ya tengo nick» y «Crear nick», THE Formulario_Acceso SHALL conservar el Nick ya introducido en el campo de Nick y SHALL retirar los mensajes de error generados en el modo anterior.
7. IF el usuario envía en modo «Ya tengo nick» un Nick que no cumple el patrón del Requisito 1 criterio 2, THEN THE Formulario_Acceso SHALL mostrar el mensaje «El nick debe tener entre 3 y 16 caracteres: letras, números, guion o guion bajo» y SHALL no realizar ninguna consulta al Sistema_Data.
8. IF la consulta de existencia del Nick en modo «Ya tengo nick» falla o no obtiene respuesta en 10 segundos, THEN THE Sistema_Identidad SHALL abandonar el intento sin conceder el acceso al Dashboard y sin escribir en el Almacen_Local_Identidad, y THE Formulario_Acceso SHALL informar del fallo según el Requisito 8 criterio 7 conservando el Nick introducido.

### Requisito 3: Un correo, un nick

**User Story:** Como organizador del ranking, quiero que cada correo pueda crear un solo nick, para que una misma persona no infle el ranking con varias identidades.

#### Criterios de Aceptación

1. THE Sistema_Data SHALL mantener como máximo un registro UserIdentity por Correo_Vinculado, comparando el valor ya normalizado (minúsculas ASCII y sin espacios en los extremos, según el Requisito 1 criterio 4).
2. IF el usuario envía en modo «Crear nick» un Correo_Vinculado que ya figura en un registro UserIdentity, THEN THE Formulario_Acceso SHALL rechazar el alta sin crear ningún registro UserIdentity y SHALL mostrar, en un plazo máximo de 3 segundos desde el envío, el mensaje «Ese correo ya tiene el nick «{nick}» asociado. Entra con él o usa otro correo», donde `{nick}` es el Nick de ese registro, conservando los valores ya escritos en los campos del formulario.
3. WHEN el Formulario_Acceso muestra el mensaje del criterio 2, THE Formulario_Acceso SHALL mostrar junto al mensaje un control «Entrar con ese nick» habilitado.
4. WHEN el usuario acciona el control del criterio 3, THE Sistema_Identidad SHALL conceder el acceso al Dashboard con el Nick del registro existente y persistirlo según el Requisito 4, sin crear ni modificar ningún registro UserIdentity.
5. WHEN el usuario envía en modo «Crear nick» un Nick válido cuyo Nick_Normalizado no existe y un Correo_Vinculado válido que no figura en ningún registro UserIdentity, THE Sistema_Identidad SHALL crear un registro UserIdentity nuevo, aunque desde ese navegador ya se hubiera creado antes otro Nick.
6. IF el Sistema_Data rechaza la creación por duplicidad de Correo_Vinculado (caso de dos altas simultáneas, Requisito 6 criterio 5), THEN THE Formulario_Acceso SHALL mantener sin crear el segundo registro UserIdentity y mostrar el mensaje del criterio 2 con el Nick del registro que sí quedó creado.
7. THE Sistema_Identidad SHALL aceptar el Correo_Vinculado sin verificación de propiedad, sin enviar correo de confirmación ni solicitar ningún código, asumiendo la limitación declarada en el Requisito 10 criterio 3.

### Requisito 4: Persistencia local de la identidad

**User Story:** Como usuario recurrente, quiero que la aplicación recuerde mi nick, para entrar directamente sin escribir nada.

#### Criterios de Aceptación

1. WHEN el Sistema_Identidad concede el acceso, THE Sistema_Identidad SHALL escribir en el Almacen_Local_Identidad, en un plazo máximo de 1 segundo, un único registro con el Nick tal como está almacenado en el registro UserIdentity y con el identificador de ese registro, sustituyendo el registro local anterior si existía.
2. WHEN la aplicación arranca y el Almacen_Local_Identidad contiene un Nick que cumple el patrón del Requisito 1 criterio 2, THE aplicación SHALL mostrar el Dashboard directamente, sin presentar el Formulario_Acceso y sin realizar ninguna consulta al Sistema_Data.
3. THE aplicación SHALL exponer en el store de Zustand un único campo con el Nick activo y el identificador de su registro UserIdentity, con valor nulo mientras el Almacen_Local_Identidad no contenga un Nick, y THE interfaz y THE Sincronizador SHALL leer el Nick activo exclusivamente de ese campo.
4. WHEN el usuario acciona el control «Cambiar de usuario», THE Sistema_Identidad SHALL eliminar del Almacen_Local_Identidad el Nick y el identificador guardados, y SHALL presentar el Formulario_Acceso en un plazo máximo de 1 segundo.
5. WHEN el usuario acciona el control «Cambiar de usuario», THE Sistema_Identidad SHALL conservar sin cambios el registro UserIdentity en el Sistema_Data, de modo que ese mismo Nick vuelva a conceder el acceso en el modo «Ya tengo nick».
6. WHEN el Nick activo se concede, se cambia o se elimina, THE aplicación SHALL actualizar el campo del store descrito en el criterio 3 en la misma acción que actualiza el Almacen_Local_Identidad.
7. IF la lectura del Almacen_Local_Identidad falla o no se resuelve en 3 segundos desde el arranque, THEN THE aplicación SHALL presentar el Formulario_Acceso, SHALL conservar sin borrar el contenido del Almacen_Local_Identidad y SHALL mantener operativos el resto de módulos de la aplicación.
8. IF la escritura en el Almacen_Local_Identidad falla, THEN THE Sistema_Identidad SHALL mantener el acceso concedido durante la sesión en curso y SHALL mostrar un aviso no bloqueante indicando que el Nick no se ha podido guardar para el próximo arranque.

### Requisito 5: Cambio de nick conservando el progreso

**User Story:** Como usuario, quiero poder cambiar mi nick, para corregir un nombre que no me gusta sin perder mi progreso.

#### Criterios de Aceptación

1. WHILE el Almacen_Local_Identidad contiene un Nick, THE aplicación SHALL ofrecer en el panel de controles un formulario de cambio de Nick con un único campo de Nick, precargado con el Nick activo, y un control de envío.
2. WHEN el usuario envía desde el formulario de cambio un Nick que cumple el patrón del Requisito 1 criterio 2 y cuyo Nick_Normalizado no existe en ningún registro UserIdentity distinto del propio, THE Sistema_Identidad SHALL actualizar el Nick y el Nick_Normalizado del registro UserIdentity activo conservando su identificador y su Correo_Vinculado, sin volver a solicitar el Correo_Vinculado.
3. WHEN la actualización del registro UserIdentity se confirma, THE Sistema_Identidad SHALL escribir el Nick nuevo como identidad activa en el Almacen_Local_Identidad y en el store de Zustand, sin requerir recargar la aplicación.
4. WHEN la actualización del registro UserIdentity se confirma, THE Sistema_Identidad SHALL dejar sin modificar en IndexedDB_Local el `GameState` (incluidos `xp`, `level`, `hp`, `streakDays` y `achievements`), la calibración y el `TeamCode` del perfil local.
5. IF el Nick enviado en el formulario de cambio no cumple el patrón del Requisito 1 criterio 2, THEN THE aplicación SHALL mostrar el mensaje «El nick debe tener entre 3 y 16 caracteres: letras, números, guion o guion bajo», conservar el Nick anterior como identidad activa y no consultar al Sistema_Data.
6. IF el Nick_Normalizado enviado ya existe en un registro UserIdentity distinto del propio, THEN THE aplicación SHALL mostrar el mensaje «Ese nick ya está en uso, prueba otro» en un plazo máximo de 3 segundos desde el envío, conservar el Nick anterior como identidad activa en el Almacen_Local_Identidad y en el store, y dejar el registro UserIdentity sin modificar.
7. IF la actualización del registro UserIdentity falla o no obtiene respuesta en 10 segundos, THEN THE aplicación SHALL mostrar un mensaje indicando que el nick no se ha podido cambiar junto a un control de reintento, y THE Sistema_Identidad SHALL conservar el Nick anterior como identidad activa en el Almacen_Local_Identidad y en el store.
8. WHEN el cambio de Nick se confirma, THE Sincronizador SHALL usar el Nick nuevo como `displayName` en la siguiente escritura del DailyRecord de la fecha actual y en todas las posteriores.
9. THE Sincronizador SHALL limitar sus escrituras al DailyRecord de la fecha actual, conservando sin reescribir el `displayName` de los DailyRecord de fechas anteriores.

### Requisito 6: Modelo UserIdentity y autorización sin propiedad por Cognito

**User Story:** Como desarrollador, quiero una tabla propia de identidades en DynamoDB y una autorización coherente con ella, para que la gestión de usuarios no dependa de Cognito.

#### Criterios de Aceptación

1. THE Sistema_Data SHALL definir el modelo UserIdentity con los campos `nick` (string, requerido, de 3 a 16 caracteres), `nickLower` (string, requerido, de 3 a 16 caracteres en minúsculas ASCII, el Nick_Normalizado) y `email` (string, requerido, de 6 a 254 caracteres, el Correo_Vinculado), y SHALL asignar a cada registro un identificador único que no cambia durante la vida del registro.
2. WHEN el Sistema_Identidad consulta la existencia de un Nick_Normalizado, THE Sistema_Data SHALL resolver la consulta mediante el índice secundario sobre `nickLower` en una única petición que devuelva 0 o 1 registros, sin recorrer registros con otro `nickLower`, y SHALL responder en 3 segundos o menos.
3. WHEN el Sistema_Identidad consulta la existencia de un Correo_Vinculado, THE Sistema_Data SHALL resolver la consulta mediante el índice secundario sobre `email` en una única petición que devuelva 0 o 1 registros, sin recorrer registros con otro `email`, y SHALL responder en 3 segundos o menos.
4. IF llegan dos o más peticiones de creación con el mismo Nick_Normalizado, THEN THE Sistema_Data SHALL persistir exactamente un registro UserIdentity con ese valor de `nickLower` mediante una comprobación del lado servidor, y SHALL rechazar cada petición restante con un error que indique que el nick ya está en uso, sin dejar registros parciales.
5. IF llegan dos o más peticiones de creación con el mismo Correo_Vinculado, THEN THE Sistema_Data SHALL persistir exactamente un registro UserIdentity con ese valor de `email` mediante una comprobación del lado servidor, y SHALL rechazar cada petición restante con un error que indique que el correo ya está registrado, sin dejar registros parciales.
6. THE Sistema_Data SHALL autorizar sobre UserIdentity exclusivamente las operaciones de creación, lectura y actualización a clientes con Credenciales_Invitado, sin exigir un usuario registrado en Cognito.
7. THE Sistema_Identidad SHALL determinar el nombre visible del usuario exclusivamente a partir del campo `nick` del registro UserIdentity, sin invocar `fetchUserAttributes` ni leer ningún atributo de Cognito para ese fin.
8. WHEN el Sincronizador escribe un DailyRecord, THE Sistema_Data SHALL condicionar la persistencia a que el Validador_AntiTrampa acepte los valores enviados según los rangos y las reglas de coherencia interna del Requisito 13, decidiendo sin considerar la identidad del cliente, y SHALL conservar los valores almacenados previamente cuando el Validador_AntiTrampa rechace la escritura.
9. IF un cliente solicita la eliminación de un registro UserIdentity, THEN THE Sistema_Data SHALL rechazar la operación con un error de autorización y SHALL conservar el registro sin cambios.
10. IF una petición de creación o actualización de UserIdentity contiene un `nick` fuera del rango de 3 a 16 caracteres, un `nickLower` que no sea el `nick` convertido a minúsculas ASCII, o un `email` vacío, THEN THE Sistema_Data SHALL rechazar la petición con un error que indique el campo inválido, sin persistir ningún cambio.
11. THE Sistema_Data SHALL autorizar sobre DailyRecord exclusivamente las operaciones de creación, lectura y actualización a clientes con Credenciales_Invitado, dejando `allow.guest()` como única regla de autorización del modelo y retirando de `amplify/data/resource.ts` las reglas `allow.owner()` y `allow.authenticated().to(['read'])` que hoy tiene, de modo que ninguna operación exija un usuario registrado en Cognito.
12. IF un cliente solicita la eliminación de un DailyRecord, THEN THE Sistema_Data SHALL rechazar la operación con un error de autorización y SHALL conservar el registro sin cambios.
13. THE Sincronizador SHALL identificar el DailyRecord que escribe exclusivamente por la combinación del `displayName` (el Nick activo) y el campo `date`, y SHALL limitar sus escrituras al `date` igual a la fecha local actual en formato YYYY-MM-DD.
14. IF una petición de creación o actualización de DailyRecord contiene un `date` que difiere en más de un día natural de la fecha UTC del instante de recepción, THEN THE Sistema_Data SHALL rechazar la petición con un error que indique que la fecha está fuera del plazo de escritura permitido, sin persistir ningún cambio; el margen de un día absorbe el desfase de zona horaria entre el cliente y el servidor.
15. THE Sistema_Data SHALL conservar el índice secundario de DailyRecord con clave de partición `teamCode` y clave de ordenación `date` sin cambios, de modo que el Ranking_Equipo siga resolviendo sus consultas con `listByTeamAndDate`.

### Requisito 7: El nick como nombre del ranking

**User Story:** Como miembro de un equipo, quiero ver mi nick en el ranking, para reconocerme en la lista en lugar de ver un correo o un identificador.

#### Criterios de Aceptación

1. WHEN el Sincronizador escribe un DailyRecord y el Almacen_Local_Identidad contiene un Nick, THE Sincronizador SHALL usar ese Nick tal como está almacenado (de 3 a 16 caracteres, sin recortes ni normalización a minúsculas) como valor del campo `displayName`, y el `TeamCode` del perfil local como valor del campo `teamCode`.
2. IF el perfil local no contiene un `TeamCode`, THEN THE Sincronizador SHALL escribir el DailyRecord con el `displayName` del Nick y sin valor en `teamCode`, y THE Ranking_Equipo SHALL excluir ese registro de la lista de todos los equipos.
3. WHEN el Ranking_Equipo recibe los DailyRecord de la fecha actual de un `TeamCode`, THE Ranking_Equipo SHALL mostrar en la columna de nombre el valor de `TeamEntry.displayName` procedente del Nick, ordenar las filas por `goodPostureSeconds` de mayor a menor y mostrar como máximo 50 filas.
4. WHILE el Almacen_Local_Identidad no contiene un Nick, THE Sincronizador SHALL mantener los datos de la sesión únicamente en IndexedDB_Local, sin transmitir ningún Checkpoint ni crear ni actualizar ningún DailyRecord.
5. WHEN el Sistema_Identidad concede el acceso y el Almacen_Local_Identidad pasa a contener un Nick, THE Sincronizador SHALL enviar el Checkpoint de la fecha actual con ese Nick como `displayName` en un plazo máximo de 10 segundos desde la concesión del acceso.
6. WHEN el Sincronizador sincroniza una fecha para la que IndexedDB_Local ya guarda el identificador de su DailyRecord, THE Sincronizador SHALL actualizar ese registro existente en lugar de crear uno nuevo.
7. WHEN el Sincronizador crea por primera vez el DailyRecord de una fecha, THE Sincronizador SHALL guardar su identificador en IndexedDB_Local, de modo que exista como máximo un DailyRecord por combinación de Nick y fecha.
8. IF la escritura del DailyRecord falla en todos los intentos de la sincronización en curso, THEN THE Sincronizador SHALL conservar los datos de la fecha en IndexedDB_Local sin pérdida, SHALL reintentar en la siguiente sincronización y SHALL evitar crear un segundo DailyRecord para esa combinación de Nick y fecha.
9. IF un DailyRecord recuperado por el Ranking_Equipo carece de `displayName` o su `displayName` es una cadena vacía o compuesta solo por espacios, THEN THE Ranking_Equipo SHALL mostrar el texto «Anónimo» en la columna de nombre y SHALL conservar la posición que le corresponde por `goodPostureSeconds`.

### Requisito 8: Formulario de acceso en la interfaz

**User Story:** Como usuario, quiero un formulario de entrada claro y en español, para entender en un vistazo qué se me pide y qué ha fallado.

#### Criterios de Aceptación

1. THE Formulario_Acceso SHALL presentar todas sus etiquetas, textos de ayuda, textos de botón y mensajes de error en español, con el tema oscuro único de la aplicación, estilado con clases de Tailwind CSS v4 y la tipografía pixel-art `Press Start 2P` auto-alojada en `public/fonts/`, sin ninguna petición a un origen externo para cargar la fuente.
2. WHILE el modo activo es «Crear nick», THE Formulario_Acceso SHALL mostrar junto al campo de correo, visible sin ninguna interacción previa del usuario, el texto explicativo «Tu correo solo se usa para evitar nicks duplicados. En el ranking solo aparece tu nick».
3. WHILE una consulta o escritura al Sistema_Data está en curso, THE Formulario_Acceso SHALL mostrar el texto «Comprobando…», presentar el botón de envío deshabilitado e ignorar cualquier envío adicional hasta que la operación termine, falle o agote el plazo del criterio 7.
4. WHILE el Nick introducido está vacío o no cumple el patrón del Requisito 1 criterio 2, THE Formulario_Acceso SHALL presentar el botón de envío deshabilitado y SHALL no procesar ningún envío, ni por pulsación del botón ni por la tecla Enter.
5. WHILE el modo activo es «Crear nick» y el correo introducido está vacío o no cumple el patrón del Requisito 1 criterio 7, THE Formulario_Acceso SHALL presentar el botón de envío deshabilitado.
6. THE Formulario_Acceso SHALL asociar cada campo con su etiqueta mediante `htmlFor`/`id` y con su texto de ayuda o su mensaje de error mediante `aria-describedby`.
7. IF una consulta o escritura del Sistema_Identidad falla o no obtiene respuesta en 10 segundos, THEN THE Formulario_Acceso SHALL mostrar el mensaje «No se pudo comprobar el nick. Revisa tu conexión e inténtalo de nuevo», conservar los valores ya introducidos en los campos, presentar un control de reintento habilitado y mantener sin crear ningún registro UserIdentity.
8. WHEN el usuario pulsa la tecla Enter en un campo del Formulario_Acceso mientras el botón de envío está habilitado, THE Formulario_Acceso SHALL ejecutar la misma acción que el botón de envío, sin recargar la página.
9. IF un campo se envía con un valor que no cumple su patrón o el Sistema_Identidad rechaza el envío, THEN THE Formulario_Acceso SHALL marcar ese campo con `aria-invalid="true"`, publicar el mensaje de error correspondiente en un elemento con `role="alert"` y trasladar el foco al primer campo con error.
10. THE Formulario_Acceso SHALL hacer alcanzables con el tabulador, en el mismo orden en que aparecen visualmente, todos sus campos y controles, presentar un indicador de foco visible con una relación de contraste mínima de 3:1 respecto al fondo adyacente y presentar todos sus textos con una relación de contraste mínima de 4,5:1 respecto a su fondo.
11. THE Formulario_Acceso SHALL limitar la entrada del campo de Nick a 16 caracteres y la del campo de correo a 254 caracteres, descartando los caracteres que excedan esos límites.

### Requisito 9: Privacidad del correo y del nick

**User Story:** Como usuario preocupado por mi privacidad, quiero saber exactamente qué datos personales salen de mi navegador y para qué, para decidir con información si entro.

#### Criterios de Aceptación

1. THE Sistema_Identidad SHALL transmitir el Correo_Vinculado al Sistema_Data exclusivamente en dos operaciones del alta: la consulta de existencia de Correo_Vinculado y la creación del registro UserIdentity, sin incluirlo en el acceso con Nick existente (Requisito 2), en el cambio de Nick (Requisito 5), en la escritura de DailyRecord ni en ninguna otra consulta o suscripción.
2. THE Sistema_Identidad SHALL limitar los datos personales que salen del navegador a tres valores: el Nick, el Nick_Normalizado y el Correo_Vinculado, sin transmitir nombre real, avatar, zona horaria, idioma del navegador, cadena de user-agent, contactos ni ningún otro campo de perfil.
3. THE aplicación SHALL limitar los datos de postura que salen del navegador a los enteros agregados del `Checkpoint` de `src/contracts/sync.ts` (fecha, segundos de buena postura, racha máxima de flow en minutos, puntuación media, nivel, XP y TeamCode), sin transmitir frames de vídeo, landmarks, métricas por frame ni la línea base de calibración.
4. THE Ranking_Equipo SHALL mostrar como identificación de cada participante exclusivamente el Nick procedente de `displayName`, sin mostrar el Correo_Vinculado ni ninguna parte de él (ni dominio, ni versión truncada, ni iniciales).
5. THE documento `docs/PRIVACY.md` SHALL incluir una entrada para el Correo_Vinculado que indique los cinco puntos siguientes: que sale del navegador, su finalidad (limitar a un Nick por persona), su ubicación (tabla UserIdentity vía AppSync), que no se publica en el Ranking_Equipo y que es el único dato personal de contacto o de identificación directa que sale del navegador, al que no se añadirá ningún otro.
6. THE aplicación SHALL mantener la directiva `connect-src` del Content-Security-Policy restringida a exactamente dos orígenes, el propio origen y el endpoint de AppSync, sin añadir ningún origen nuevo por causa de esta funcionalidad y sin producir violaciones de CSP durante el alta ni durante el acceso al ejecutar el build de producción.
7. THE Sistema_Data SHALL excluir el campo `email` de toda respuesta de consulta que alimente el Ranking_Equipo, de modo que el Correo_Vinculado no llegue al cliente que muestra el ranking en ningún campo de la respuesta.
8. WHEN el Sistema_Identidad concede el acceso, THE Sistema_Identidad SHALL persistir únicamente el Nick y el identificador del registro UserIdentity en el Almacen_Local_Identidad, sin escribir el Correo_Vinculado en IndexedDB_Local ni exponerlo en el store de Zustand.
9. THE aplicación SHALL realizar las peticiones de red del alta y del acceso exclusivamente al endpoint de AppSync, sin peticiones a servicios de telemetría, analítica o validación de correo de terceros.
10. THE Correo_Vinculado SHALL ser el único dato personal de contacto o de identificación directa que sale del navegador en todo el producto, y THE aplicación SHALL mantener el conjunto de datos salientes limitado a los valores enumerados en los criterios 2 y 3, de modo que cualquier dato personal adicional requiera antes una revisión escrita de este requisito.

### Requisito 10: Limitaciones asumidas del esquema sin contraseña

**User Story:** Como responsable del producto, quiero que las limitaciones de seguridad de este esquema queden escritas, para que nadie las descubra por sorpresa durante la demo o el juicio.

#### Criterios de Aceptación

1. THE documento `docs/PRIVACY.md` SHALL declarar, en la sección del criterio 7, que el acceso por Nick no comprueba ningún factor de autenticación y que cualquier persona que conozca un Nick registrado puede obtener acceso con él y escribir DailyRecord con ese `displayName`.
2. THE documento `docs/PRIVACY.md` SHALL declarar, en la sección del criterio 7, que quien conozca un Correo_Vinculado puede descubrir el Nick asociado, porque el mensaje del Requisito 3 criterio 2 revela ese Nick a quien envíe el correo en el modo «Crear nick».
3. THE documento `docs/PRIVACY.md` SHALL declarar, en la sección del criterio 7, que el Correo_Vinculado se acepta sin verificación de propiedad (sin correo de confirmación ni código), por lo que un correo inexistente o perteneciente a otra persona permite crear un Nick, y que el único efecto del correo es limitar a un Nick por dirección distinta.
4. THE documento `docs/PRIVACY.md` SHALL declarar, en la sección del criterio 7, que las Credenciales_Invitado autorizadas en el Requisito 6 criterio 6 permiten leer, crear y actualizar cualquier registro UserIdentity, incluido el Nick de otra persona, por lo que la titularidad de un Nick no está protegida.
5. WHILE el Formulario_Acceso está visible en cualquiera de sus dos modos («Ya tengo nick» y «Crear nick»), THE Formulario_Acceso SHALL mostrar el texto «Ranking amistoso: la identidad por nick no está verificada» sin requerir desplazamiento, despliegue ni ninguna interacción previa del usuario, con una relación de contraste de al menos 4,5:1 frente a su fondo.
6. THE Ranking_Equipo SHALL exponer por cada participante exclusivamente estos cuatro valores: Nick, segundos de buena postura, nivel y racha de días, y SHALL excluir cualquier otro valor, en particular el Correo_Vinculado, el identificador del registro UserIdentity y cualquier métrica por frame.
7. THE documento `docs/PRIVACY.md` SHALL contener una única sección titulada «Limitaciones asumidas del acceso por nick», redactada en español, que agrupe las seis declaraciones de los criterios 1 a 4, 9 y 10 como limitaciones asumidas y no como defectos pendientes de corregir.
8. THE documento `docs/PRIVACY.md` SHALL indicar, para cada una de las seis declaraciones de los criterios 1 a 4, 9 y 10, el requisito de esta especificación que la origina (Requisito 2 criterio 5, Requisito 3 criterios 2 y 7, Requisito 6 criterios 6 y 11, y Requisito 13 criterio 9) y el motivo por el que se asume: ranking amistoso de hackathon cuyos datos expuestos son los enumerados en el criterio 6.
9. THE documento `docs/PRIVACY.md` SHALL declarar, en la sección del criterio 7, que al retirarse `allow.owner()` del modelo DailyRecord (Requisito 6 criterio 11) cualquier cliente con Credenciales_Invitado puede crear y actualizar el DailyRecord de la fecha actual de cualquier Nick, incluido uno ajeno, y que la única defensa frente a valores falseados es la validación de rangos y coherencia del lado servidor del Requisito 13, que no comprueba quién escribe.
10. THE documento `docs/PRIVACY.md` SHALL declarar, en la sección del criterio 7, que el Validador_AntiTrampa recibe del cliente los valores previos con los que acota el incremento por sincronización (Requisito 13 criterio 9), por lo que esa comprobación concreta es un freno y no una garantía, mientras que los límites absolutos y de coherencia del Requisito 13 criterios 4 a 8 se aplican siempre.

### Requisito 11: Fronteras de módulos y contratos compartidos

**User Story:** Como miembro del equipo, quiero que esta funcionalidad respete las fronteras acordadas, para que no rompa el código de las otras dos personas en la integración.

#### Criterios de Aceptación

1. THE implementación SHALL transportar el Nick hacia el Sistema_Data usando exclusivamente el campo `displayName` ya existente del modelo DailyRecord, y SHALL conservar el tipo `Checkpoint` de `src/contracts/sync.ts` sin añadir, renombrar ni eliminar ninguno de sus campos.
2. THE Ranking_Equipo SHALL obtener el Nick que muestra en la columna de nombre del campo `displayName` ya existente del tipo `TeamEntry`, y THE implementación SHALL conservar `TeamEntry` sin añadir, renombrar ni eliminar ninguno de sus campos.
3. IF la implementación necesita un tipo compartido nuevo (por ejemplo `UserIdentity` o `IdentityError`), THEN THE implementación SHALL declararlo en `src/storage/` y SHALL dejar `src/contracts/**` sin modificar mientras el acuerdo del equipo no conste por escrito en la sección «Notas de coordinación» de este documento.
4. THE Sistema_Identidad SHALL residir en `src/storage/` y SHALL importar de `src/` únicamente desde `src/contracts/`, sin importar de `src/vision/`, `src/posture/`, `src/game/`, `src/feedback/`, `src/pip/`, `src/store/` ni `src/ui/`; las dependencias externas de npm ya presentes en el proyecto quedan fuera de esta restricción.
5. THE Formulario_Acceso SHALL residir en `src/ui/` y SHALL importar de `src/` únicamente desde `src/contracts/` y `src/store/`, sin importar `src/storage/` de forma directa.
6. THE implementación SHALL mantener un diff vacío respecto a `main` en los directorios `src/vision/`, `src/posture/`, `src/game/`, `src/feedback/` y `src/pip/`, y SHALL dejar anotado como propuesta cualquier cambio que crea necesario en ellos en lugar de escribirlo.
7. WHEN la rama de esta funcionalidad se propone para integrar en `main`, THE implementación SHALL presentar un diff vacío respecto a `main` en `src/contracts/**`, salvo que exista el acuerdo escrito descrito en el criterio 3.
8. WHEN la rama de esta funcionalidad se propone para integrar en `main`, THE implementación SHALL completar `npm run build` sin errores de tipos y `npm test -- run` sin ningún test fallido.

### Requisito 12: Degradación sin conexión

**User Story:** Como usuario sin conexión, quiero poder usar la aplicación igualmente, para que el nick sea un extra y no un muro de entrada.

#### Criterios de Aceptación

1. WHILE `navigator.onLine` es `false` y el Almacen_Local_Identidad no contiene un Nick, THE Formulario_Acceso SHALL ofrecer un control «Continuar sin nick» que, al accionarse, dé acceso al Dashboard en un plazo máximo de 2 segundos y sin realizar ninguna consulta al Sistema_Data, con la detección de postura a 5 FPS, el motor de juego y la escritura en IndexedDB_Local operando igual que en una sesión con Nick.
2. WHEN el usuario accede mediante «Continuar sin nick», THE aplicación SHALL mostrar en el Dashboard un aviso que no capture el foco, no impida ninguna acción del Dashboard y no requiera ser cerrado para seguir usando la aplicación, con un control «Elegir nick» que abra el Formulario_Acceso y un control para cerrar el aviso.
3. IF una consulta de unicidad o una escritura del Sistema_Identidad no obtiene respuesta en 10 segundos, THEN THE Sistema_Identidad SHALL abandonar el intento sin crear ni modificar ningún registro UserIdentity, SHALL conservar en el Formulario_Acceso los valores de Nick y correo ya introducidos y SHALL informar del fallo según el Requisito 8 criterio 7.
4. WHILE una consulta o escritura del Sistema_Identidad está en curso, THE aplicación SHALL mantener la inferencia del Web Worker a su cadencia de 5 FPS y la escritura de minutos en IndexedDB_Local a su cadencia de una escritura por minuto, ejecutando las llamadas al Sistema_Data de forma asíncrona sin bloquear el hilo principal.
5. IF el módulo de Amplify falla al inicializarse o no completa su inicialización en 10 segundos desde el arranque, THEN THE aplicación SHALL presentar el Formulario_Acceso con el control «Continuar sin nick» habilitado, sin mostrar ningún diálogo que impida el acceso al Dashboard.
6. IF el usuario envía un Nick mientras `navigator.onLine` es `false`, THEN THE Formulario_Acceso SHALL mostrar un mensaje de error indicando que no hay conexión para comprobar el nick, SHALL mantener sin crear ningún registro UserIdentity y SHALL mantener visible el control «Continuar sin nick».
7. WHEN el Sistema_Identidad concede el acceso con un Nick tras una sesión iniciada con «Continuar sin nick», THE Sistema_Identidad SHALL conservar sin reiniciar el `GameState`, la calibración y los minutos ya guardados en IndexedDB_Local.
8. WHEN `navigator.onLine` pasa de `false` a `true` durante una sesión iniciada con «Continuar sin nick», THE aplicación SHALL mantener la sesión activa sin interrumpir la detección ni presentar el Formulario_Acceso, y SHALL mantener disponible el control «Elegir nick» del criterio 2.

### Requisito 13: Validación anti-trampa sin propiedad por Cognito

**User Story:** Como organizador del ranking, quiero que el servidor rechace valores imposibles mirando solo los números enviados, para que el ranking siga siendo defendible ahora que ningún registro pertenece a una cuenta de Cognito.

#### Criterios de Aceptación

1. THE Validador_AntiTrampa SHALL ejecutarse como función Lambda adjunta a la mutación `validateAndUpdateDailyRecord` antes de que el dato se persista en DynamoDB, y SHALL decidir la aceptación o el rechazo exclusivamente a partir de los valores numéricos y de fecha recibidos en la mutación, sin leer la identidad, el `owner` ni el token del cliente.
2. THE Sistema_Data SHALL autorizar la mutación `validateAndUpdateDailyRecord` a clientes con Credenciales_Invitado, sustituyendo en `amplify/data/resource.ts` la regla `allow.authenticated()` que la protege hoy, de modo que el Sincronizador pueda invocarla sin usuario registrado en Cognito.
3. THE Validador_AntiTrampa SHALL evaluar los criterios 4 a 8 usando exclusivamente los valores enviados en la mutación, de modo que su resultado sea independiente de los argumentos `previousGoodPostureSeconds` y `previousUpdatedAt`, que proceden del cliente.
4. IF `goodPostureSeconds` supera 86 400, THEN THE Validador_AntiTrampa SHALL rechazar la mutación con un mensaje que indique que el valor excede el máximo diario (regla ya implementada en `amplify/data/anti-cheat-handler/handler.ts` con la constante `MAX_DAILY_SECONDS`).
5. IF `goodPostureSeconds` supera los segundos transcurridos entre las 00:00 UTC de la fecha `date` y el instante de recepción, más un margen de 50 400 segundos que absorbe el desfase máximo de zona horaria, THEN THE Validador_AntiTrampa SHALL rechazar la mutación con un mensaje que indique que los segundos declarados exceden el tiempo transcurrido del día (regla nueva, ausente hoy en `handler.ts`).
6. IF el valor de `longestFlowStreak` multiplicado por 60 supera `goodPostureSeconds` más 60 segundos de margen por el redondeo a minutos, THEN THE Validador_AntiTrampa SHALL rechazar la mutación con un mensaje que indique que la racha de flow excede los segundos de buena postura (regla nueva, ausente hoy en `handler.ts`).
7. IF `avgScore` es menor que 0 o mayor que 100, THEN THE Validador_AntiTrampa SHALL rechazar la mutación con un mensaje que indique que la puntuación media está fuera del rango de 0 a 100 (regla nueva, ausente hoy en `handler.ts`).
8. IF `level` es menor que 1, `xp` es menor que 0, `xp` es mayor o igual que el umbral del nivel declarado (parte entera de 100 × `level`^1,5) o, cuando `level` es mayor que 1, `xp` es menor que el umbral del nivel anterior (parte entera de 100 × (`level` − 1)^1,5), THEN THE Validador_AntiTrampa SHALL rechazar la mutación con un mensaje que indique que el nivel y el XP son incoherentes; los valores 100 y 1,5 son las constantes `LEVEL_BASE_XP` y `LEVEL_EXPONENT` de `src/game/engine.ts` (regla nueva, ausente hoy en `handler.ts`).
9. IF los argumentos `previousGoodPostureSeconds` y `previousUpdatedAt` llegan con valor y el incremento de `goodPostureSeconds` respecto al valor previo supera los segundos transcurridos desde `previousUpdatedAt` multiplicados por 1,1, THEN THE Validador_AntiTrampa SHALL rechazar la mutación con un mensaje que indique que el incremento excede el tiempo transcurrido permitido (regla ya implementada en `handler.ts` con la constante `TOLERANCE_FACTOR`).
10. WHEN el Validador_AntiTrampa rechaza una mutación, THE Sistema_Data SHALL conservar sin cambio alguno los valores ya almacenados en el DailyRecord de esa combinación de `displayName` y `date`, y THE Validador_AntiTrampa SHALL devolver un mensaje prefijado con el token `ANTICHEAT_REJECT` que nombre la regla incumplida.
11. WHEN el Validador_AntiTrampa acepta una mutación, THE Sistema_Data SHALL persistir los valores recibidos en el DailyRecord de esa combinación de `displayName` y `date` y SHALL devolver el identificador, la fecha y los segundos de buena postura persistidos.
12. WHEN el Validador_AntiTrampa recibe la primera escritura de una fecha, sin valores previos con los que comparar, THE Validador_AntiTrampa SHALL aplicar los criterios 4 a 8 y SHALL aceptar la mutación que los cumpla.
13. IF una invocación de `validateAndUpdateDailyRecord` falla con un mensaje que no lleva el prefijo `ANTICHEAT_REJECT`, THEN THE Sincronizador SHALL tratar el fallo como error de infraestructura, reintentarlo según el Requisito 7 criterio 8 y conservar los datos de la fecha en IndexedDB_Local, sin marcar la sesión como trampa.

### Requisito 14: Sustitución de la definición de usuario de `backend-nube`

**User Story:** Como miembro del equipo, quiero que solo quede una definición de usuario vigente, para que nadie implemente la identidad de Cognito y la del Nick a la vez.

#### Criterios de Aceptación

1. THE especificación `identidad-nick` SHALL constituir la única definición vigente de la identidad del usuario en el producto, y THE especificación `backend-nube` SHALL marcar con la anotación «SUSTITUIDO por identidad-nick» los criterios enumerados en los criterios 2 a 5 de este requisito.
2. THE especificación `backend-nube` SHALL marcar como sustituidos los criterios 1, 3, 4, 5 y 6 de su Requisito 1 (login por email y contraseña, credenciales por usuario autenticado, permisos de invitado limitados a lectura y propiedad por `owner`), y SHALL conservar vigente su criterio 2 (acceso de invitado de Cognito), que es la base de las Credenciales_Invitado de esta especificación.
3. THE especificación `backend-nube` SHALL marcar como sustituidos por el Requisito 6 criterios 11 a 14 de esta especificación los criterios 2, 3 y 5 de su Requisito 2 (autorización con `allow.owner()`, autorización de lectura con `allow.authenticated()` y upsert por `owner`), y SHALL conservar vigentes sus criterios 1 y 4 (campos del modelo e índice secundario por `teamCode` y `date`).
4. THE especificación `backend-nube` SHALL marcar como sustituidos por el Requisito 13 de esta especificación los cinco criterios de su Requisito 5 (validación anti-trampa apoyada en el registro previo del mismo usuario autenticado).
5. THE especificación `backend-nube` SHALL marcar como sustituidos los criterios 1 y 6 de su Requisito 4, que condicionan la sincronización a una sesión autenticada de Cognito, quedando la condición de envío definida por el Requisito 7 criterios 4 y 5 de esta especificación: existe un Nick activo en el Almacen_Local_Identidad.
6. THE especificación `backend-nube` SHALL conservar vigentes los cinco criterios de su Requisito 6 (ranking por código de equipo), cuyo `displayName` pasa a ser el Nick según el Requisito 7 de esta especificación.
7. THE aplicación SHALL retirar de la interfaz el login por email y contraseña de Cognito, eliminando el uso del componente `Authenticator` de `@aws-amplify/ui-react` en `src/main.tsx` y en `src/ui/SyncControl.tsx`, y SHALL conservar en `amplify/auth/resource.ts` la configuración estrictamente necesaria para que el identity pool emita Credenciales_Invitado.
8. THE Sincronizador SHALL obtener el `displayName` del Nick activo del store de Zustand, sin invocar `fetchUserAttributes` ni condicionar el envío al resultado de `fetchAuthSession`.
9. THE Sincronizador SHALL omitir toda consulta y escritura del modelo Streak, que sigue autorizado con `allow.owner()` y queda sin usuario propietario, y THE aplicación SHALL tomar la racha de días del campo `streakDays` del `GameState` de IndexedDB_Local; THE especificación `backend-nube` SHALL marcar los cinco criterios de su Requisito 3 como suspendidos por esta decisión.
10. THE implementación de esta especificación SHALL aplicar las anotaciones de sustitución de los criterios 1 a 6 y 9 como tarea de implementación sobre el documento de requisitos de `backend-nube`, sin cambiar ningún otro contenido de esa especificación y sin modificar sus criterios conservados.

## Notas de coordinación (requieren acuerdo antes de implementar)

Esto no son requisitos: es la única decisión que sigue abierta y que afecta a
código compartido.

1. **`src/contracts/**` no se toca en esta spec.** El Nick viaja en el campo
   `displayName` que ya existe en el modelo `DailyRecord` y en el tipo
   `TeamEntry`. Si al diseñar aparece la necesidad de un tipo compartido
   (`UserIdentity`, `IdentityError`), hay que acordarlo con V y M: por defecto
   vivirá en `src/storage/`.

### Decisiones ya cerradas

Estaban en esta sección y ya no requieren acuerdo. Se conservan aquí como
registro de por qué el documento dice lo que dice.

- **Autorización de los `DailyRecord`.** Cerrada: se retira `allow.owner()` y la
  autorización pasa a las Credenciales_Invitado que ya existen. El anti-trampa
  se replantea como validación de rangos y coherencia del lado servidor, sin
  mirar quién escribe (Requisito 6 criterios 8 y 11 a 14, Requisito 13), y la
  exposición que esto abre queda declarada en el Requisito 10 criterios 9 y 10.
- **El Correo_Vinculado como dato saliente.** Cerrada: se documenta como el
  único dato personal de contacto que sale del navegador y no se añadirá ninguno
  más (Requisito 9 criterios 2, 5 y 10).
- **Coexistencia con `backend-nube`.** Cerrada: se retira el login por email y
  contraseña de la interfaz y los criterios de identidad por Cognito de esa
  especificación se marcan como sustituidos, dejando esta como única definición
  de usuario (Requisito 14).
