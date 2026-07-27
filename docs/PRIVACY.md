# SpineHero — Privacidad

Este documento es la fuente de verdad sobre qué datos salen del navegador, para
qué se usan y qué limitaciones de seguridad asumimos a cambio de no pedir
contraseña. Es el sustento del diferencial «Privacidad demostrable, no
declarada»: cada afirmación de aquí puede comprobarse en directo (pestaña
Network, WiFi desconectado, CSP del build de producción).

## Qué NO sale nunca del navegador

- Vídeo de la cámara, frames individuales o `ImageBitmap`.
- Landmarks de MediaPipe (posición de hombros, orejas, nariz) ni la coordenada
  `z`.
- Métricas de postura por frame (`neckRatio`, `proximity`, `tilt`,
  `headTilt`) ni la línea base de calibración.
- Nombre real, avatar, zona horaria, idioma del navegador, cadena de
  user-agent, contactos o cualquier otro campo de perfil.
- Contraseña: este producto no usa contraseñas, ni de Cognito ni propias.

El pipeline de `src/vision/` y `src/posture/` no hace ninguna petición de red
(regla dura de `tech.md`). Todos los modelos y el WASM de MediaPipe se sirven
desde `/public`, nunca desde un CDN.

## Qué sale del navegador

### El `Checkpoint` de postura y progreso

Lo único que envía el Sincronizador por cada día son enteros agregados del
tipo `Checkpoint` (`src/contracts/sync.ts`): fecha, segundos de buena postura,
racha máxima de flow en minutos, puntuación media, nivel, XP y el código de
equipo. Se persiste como `DailyRecord` vía AppSync.

### El Nick y el Nick_Normalizado

El Nick que el usuario escribe (y su forma en minúsculas, el Nick_Normalizado)
salen del navegador para comprobar que no esté en uso y para crear o
actualizar el registro `UserIdentity` en DynamoDB vía AppSync. El Nick es
también el `displayName` que aparece en el `DailyRecord` y en el
`Ranking_Equipo`.

### El Correo_Vinculado

El correo electrónico que se pide en los dos modos del formulario de acceso
(«Crear nick» y «Ya tengo nick») es el único dato personal de contacto o de
identificación directa de todo el producto. Sus cinco características:

1. **Sale del navegador**: se transmite al backend en exactamente tres
   operaciones, la consulta de existencia de correo y la creación del registro
   `UserIdentity` —las dos del alta— y la consulta de titularidad al entrar con
   un nick ya creado. En las tres, el correo es la clave de la operación y su
   valor lo acaba de escribir quien lo envía: ninguna respuesta devuelve el
   correo almacenado de una identidad. No se transmite en el cambio de nick, en
   la escritura de `DailyRecord` ni en ninguna otra consulta o suscripción.
2. **Finalidad**: dos usos y ninguno más. Limitar a un Nick por persona, para
   que una misma persona no pueda inflar el `Ranking_Equipo` creando varias
   identidades; y comprobar, al entrar con un nick ya creado, que ese nick
   pertenece a quien lo reclamó, de modo que conocer un nick ajeno no baste
   para entrar con él.
3. **Ubicación**: se almacena exclusivamente en el campo `email` de la tabla
   `UserIdentity`, accedida vía AppSync. No se guarda en IndexedDB ni se
   expone en el store de Zustand.
4. **No se publica en el Ranking_Equipo**: el `Ranking_Equipo` solo muestra el
   Nick procedente de `displayName`; el campo `email` se excluye de toda
   respuesta de consulta que alimente el ranking, así que el correo no llega
   al cliente que lo muestra en ningún campo de la respuesta.
5. **Es el único dato de este tipo**: el Correo_Vinculado es el único dato
   personal de contacto o de identificación directa que sale del navegador en
   todo el producto. No se añadirá ningún otro (nombre real, teléfono, red
   social, etc.) sin una revisión escrita de esta decisión.

## Limitaciones asumidas del acceso por nick

El esquema sin contraseña de `identidad-nick` no autentica a nadie: comprueba
que un Nick esté libre en el alta, y que pertenezca a un correo concreto en el
acceso. Esto es una decisión consciente, proporcional a un ranking amistoso de
hackathon cuyos únicos datos expuestos por participante son el Nick, los
segundos de buena postura, el nivel y la racha de días — nada sensible. Las
siete limitaciones siguientes son **concesiones asumidas a cambio de esa
sencillez, no defectos pendientes de corregir**.

1. **El acceso exige el correo del Nick, pero eso no es autenticación.**
   Entrar con un Nick ya creado pide la pareja (Nick, Correo_Vinculado) y solo
   se concede si ese Nick es el que reclamó ese correo, así que conocer un Nick
   ajeno ya no basta. Lo que no hay es ninguna prueba de que quien entra sea el
   dueño del correo: quien conozca las dos cosas obtiene acceso con ese Nick y
   puede escribir un `DailyRecord` con ese `displayName`.
   *Origen: Requisito 2 criterio 5.*
   *Motivo asumido: ranking amistoso de hackathon con datos no sensibles
   (Nick, segundos de buena postura, nivel y racha de días).*

2. **Quien conozca un Correo_Vinculado puede descubrir el Nick asociado.**
   El mensaje «Ese correo ya tiene el nick «{nick}» asociado…» que se muestra
   en el modo «Crear nick» revela ese Nick a quien envíe el correo.
   *Origen: Requisito 3 criterio 2.*
   *Motivo asumido: ranking amistoso de hackathon con datos no sensibles
   (Nick, segundos de buena postura, nivel y racha de días).*

3. **El Correo_Vinculado se acepta sin verificación de propiedad.** No se
   envía correo de confirmación ni se solicita ningún código, así que un
   correo inexistente o de otra persona permite crear un Nick igualmente; el
   único efecto real del correo es limitar a un Nick por dirección distinta.
   *Origen: Requisito 3 criterio 7.*
   *Motivo asumido: ranking amistoso de hackathon con datos no sensibles
   (Nick, segundos de buena postura, nivel y racha de días).*

4. **Las Credenciales_Invitado no protegen la titularidad de un Nick.**
   Permiten leer, crear y actualizar cualquier registro `UserIdentity`,
   incluido el Nick de otra persona.
   *Origen: Requisito 6 criterio 6.*
   *Motivo asumido: ranking amistoso de hackathon con datos no sensibles
   (Nick, segundos de buena postura, nivel y racha de días).*

5. **Cualquier cliente puede escribir el `DailyRecord` de cualquier Nick.**
   Al retirarse `allow.owner()` del modelo `DailyRecord`, cualquier cliente con
   Credenciales_Invitado puede crear o actualizar el `DailyRecord` de la fecha
   actual de cualquier Nick, incluido uno ajeno. La única defensa es la
   validación de rangos y coherencia del lado servidor (Requisito 13), que no
   comprueba quién escribe.
   *Origen: Requisito 6 criterio 11.*
   *Motivo asumido: ranking amistoso de hackathon con datos no sensibles
   (Nick, segundos de buena postura, nivel y racha de días).*

6. **El límite de incremento por sincronización es un freno, no una
   garantía.** El Validador_AntiTrampa recibe del propio cliente los valores
   previos (`previousGoodPostureSeconds` y `previousUpdatedAt`) con los que
   acota el incremento entre sincronizaciones, así que esa comprobación
   concreta puede evitarse enviando valores previos falsos. Los límites
   absolutos y de coherencia interna (rango diario, relación entre flow y
   segundos, rango de puntuación media, coherencia entre nivel y XP) se
   aplican siempre, sin depender de ningún valor enviado por el cliente.
   *Origen: Requisito 13 criterio 9.*
   *Motivo asumido: ranking amistoso de hackathon con datos no sensibles
   (Nick, segundos de buena postura, nivel y racha de días).*

7. **La comprobación de titularidad del acceso se puede rodear.** La resuelve
   el cliente y descansa en que el `email` almacenado no se pueda leer: la
   aplicación consulta por correo y excluye ese campo de la selección, así que
   nunca lo trae. Pero las Credenciales_Invitado autorizan la lectura de los
   modelos `UserIdentity` y `EmailClaim`, y un cliente construido a mano puede
   pedir el campo `email` en la selección, o listar `EmailClaim`, y recuperar
   así el correo asociado a un Nick. Para quien haga eso, la comprobación deja
   de ser un obstáculo. Cerrarlo exige mover la comprobación a una función del
   lado servidor o restringir la lectura de esos dos modelos; no se ha hecho en
   esta versión.
   *Origen: Requisito 2 criterio 11 y Requisito 6 criterio 6.*
   *Motivo asumido: ranking amistoso de hackathon con datos no sensibles
   (Nick, segundos de buena postura, nivel y racha de días).*

## Cómo comprobarlo en directo

- Pestaña **Network** del navegador durante el alta: solo debe verse tráfico
  hacia el endpoint de AppSync, nunca hacia un servicio de validación de
  correo, telemetría o analítica de terceros.
- **WiFi desconectado**: la detección de postura, el motor de juego y el
  guardado en IndexedDB siguen funcionando; solo falla la sincronización.
- **CSP del build de producción** (`npm run build` + `npm run preview`): la
  directiva `connect-src` debe listar exactamente dos orígenes, el propio y el
  endpoint de AppSync.
