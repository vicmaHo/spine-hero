import { type ClientSchema, a, defineData, defineFunction } from '@aws-amplify/backend';

// ─── Anti-cheat validator Lambda ──────────────────────────────────────────────

export const antiCheatValidator = defineFunction({
  entry: './anti-cheat-handler/handler.ts',
  name: 'antiCheatValidator',
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = a.schema({
  UserIdentity: a
    .model({
      nick: a.string().required().validate((v) =>
        v
          .minLength(3, 'nick demasiado corto')
          .maxLength(16, 'nick demasiado largo')
          .matches('^[A-Za-z0-9_-]{3,16}$', 'nick con caracteres no permitidos'),
      ),
      nickLower: a.string().required().validate((v) =>
        v
          .minLength(3, 'nickLower demasiado corto')
          .maxLength(16, 'nickLower demasiado largo')
          .matches('^[a-z0-9_-]{3,16}$', 'nickLower debe estar en minúsculas'),
      ),
      email: a.string().required().validate((v) =>
        v
          .minLength(6, 'correo demasiado corto')
          .maxLength(254, 'correo demasiado largo'),
      ),
    })
    .secondaryIndexes((index) => [
      index('nickLower').queryField('listByNickLower'),
      index('email').queryField('listByEmail'),
    ])
    .authorization((allow) => [allow.guest().to(['create', 'read', 'update'])]),

  NickClaim: a
    .model({
      nickLower: a.string().required(),
      identityId: a.string().required(),
    })
    .identifier(['nickLower'])
    .authorization((allow) => [allow.guest().to(['create', 'read'])]),

  EmailClaim: a
    .model({
      email: a.string().required(),
      identityId: a.string().required(),
    })
    .identifier(['email'])
    .authorization((allow) => [allow.guest().to(['create', 'read'])]),

  DailyRecord: a
    .model({
      date: a.date().required(),
      goodPostureSeconds: a.integer().required(),
      longestFlowStreak: a.integer(),
      avgScore: a.integer(),
      level: a.integer(),
      xp: a.integer(),
      teamCode: a.string(),
      displayName: a.string(),
    })
    .secondaryIndexes((index) => [
      index('teamCode').sortKeys(['date']).queryField('listByTeamAndDate'),
      // Índice nuevo: permite al Validador_AntiTrampa localizar la fila que ya
      // existe para un (displayName, date) antes de crear otra. Sin él, la
      // unicidad del Req 7.7 dependía de un puntero guardado en IndexedDB, que
      // se pierde al borrar los datos del sitio o al entrar desde otro
      // navegador, y el resultado eran varias filas del mismo nick el mismo día.
      index('displayName').sortKeys(['date']).queryField('listByNameAndDate'),
    ])
    .authorization((allow) => [allow.guest().to(['create', 'read', 'update'])]),

  Streak: a
    .model({
      currentDays: a.integer().required().default(0),
      bestDays: a.integer().required().default(0),
      lastActiveDate: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),

  // ─── Custom mutation: update con validación anti-trampa ───────────────────
  ValidatedUpdateResult: a.customType({
    id: a.string().required(),
    date: a.date().required(),
    goodPostureSeconds: a.integer().required(),
  }),

  validateAndUpdateDailyRecord: a
    .mutation()
    .arguments({
      id: a.string(),
      date: a.date().required(),
      displayName: a.string().required(),
      goodPostureSeconds: a.integer().required(),
      previousGoodPostureSeconds: a.integer(),
      previousUpdatedAt: a.string(),
      longestFlowStreak: a.integer(),
      avgScore: a.integer(),
      level: a.integer(),
      xp: a.integer(),
      teamCode: a.string(),
    })
    .returns(a.ref('ValidatedUpdateResult'))
    .authorization((allow) => [allow.guest()])
    .handler(a.handler.function(antiCheatValidator)),
})
  // La Lambda antiCheatValidator persiste el DailyRecord ella misma (create
  // sin id, update con id), así que necesita permiso para mutar contra la
  // propia API de AppSync desde su rol de ejecución.
  //
  // `query` además de `mutate`: la Lambda consulta `listByNameAndDate` para
  // localizar la fila que ya existe de ese nick y ese día antes de crear otra
  // (Req 7.7). Sin este verbo su rol solo alcanza `/types/Mutation/*` y la
  // consulta responde «Not Authorized», lo que hacía fallar toda escritura.
  .authorization((allow) => [allow.resource(antiCheatValidator).to(['mutate', 'query'])]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  // Sin esto el modo por defecto de la API es `userPool`, y todo cliente que no
  // pase `authMode` sale con un token de Cognito que ya no existe (el
  // Authenticator se retiró en identidad-nick, Req 14.7): toda operación falla
  // como no autorizada. Las Credenciales_Invitado del identity pool son las
  // únicas que la app usa (Req 6.6, 6.11, 13.2), así que ese es el defecto.
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});
