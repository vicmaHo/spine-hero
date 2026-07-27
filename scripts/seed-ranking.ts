/**
 * Script para crear 3 registros de ejemplo en DailyRecord para que la demo
 * del ranking no aparezca vacía. Ejecutar una sola vez con:
 *
 *   npx tsx scripts/seed-ranking.ts
 *
 * Requiere que el sandbox de Amplify esté corriendo (npx ampx sandbox).
 * Usa autenticación de invitado.
 */

import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json';
import type { Schema } from '../amplify/data/resource';

Amplify.configure(outputs as Parameters<typeof Amplify.configure>[0]);

const client = generateClient<Schema>();

const TEAM_CODE = 'DEMO1';
const today = new Date().toISOString().slice(0, 10);

const seeds = [
  { date: today, goodPostureSeconds: 5400, longestFlowStreak: 45, avgScore: 82, level: 5, xp: 1200, teamCode: TEAM_CODE, displayName: 'Ana García' },
  { date: today, goodPostureSeconds: 3900, longestFlowStreak: 30, avgScore: 75, level: 3, xp: 800, teamCode: TEAM_CODE, displayName: 'Carlos López' },
  { date: today, goodPostureSeconds: 2700, longestFlowStreak: 20, avgScore: 68, level: 2, xp: 450, teamCode: TEAM_CODE, displayName: 'María Ruiz' },
];

async function main() {
  console.log(`Creando ${seeds.length} registros para teamCode="${TEAM_CODE}" fecha=${today}...`);

  for (const seed of seeds) {
    try {
      const { data, errors } = await client.models.DailyRecord.create(seed);
      if (errors) {
        console.error('Error:', errors);
      } else {
        console.log(`✓ Creado: ${seed.displayName} — ${seed.goodPostureSeconds}s`);
      }
    } catch (err) {
      console.error(`✗ Fallo para ${seed.displayName}:`, err);
    }
  }

  console.log('Seed completado.');
}

main();
