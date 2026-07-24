import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

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
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
});
