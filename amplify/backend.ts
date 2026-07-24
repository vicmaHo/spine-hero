import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';

// TODO: Adjuntar anti-cheat-validator como handler de mutación de DailyRecord
// cuando amplify/data/anti-cheat-validator.ts esté implementado (task 2.3).

const backend = defineBackend({
  auth,
  data,
});
