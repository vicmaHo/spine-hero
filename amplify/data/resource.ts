import { type ClientSchema, a, defineData, defineFunction } from '@aws-amplify/backend';

// ─── Anti-cheat validator Lambda ──────────────────────────────────────────────

export const antiCheatValidator = defineFunction({
  entry: './anti-cheat-handler/handler.ts',
  name: 'antiCheatValidator',
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = a.schema({
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
    ])
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
      allow.guest().to(['read']),
    ]),

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
      id: a.string().required(),
      date: a.date().required(),
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
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(antiCheatValidator)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
});
