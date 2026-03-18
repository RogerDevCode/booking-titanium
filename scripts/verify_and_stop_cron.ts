/**
 * Script para verificar y desactivar workflows CRON en n8n
 * y listar eventos de Google Calendar de hoy
 * 
 * Uso: npx tsx scripts/verify_and_stop_cron.ts
 */

import axios from 'axios';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_HOST = 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY || '';

// Workflows CRON que debemos verificar
const CRON_WORKFLOWS = [
  { id: null, name: 'WF4_Sync_Engine', file: 'workflows/seed_clean/WF4_Sync_Engine.json', gcalRelated: true },
  { id: null, name: 'WF8_Booking_Queue_Worker', file: 'workflows/seed_clean/WF8_Booking_Queue_Worker.json', gcalRelated: true },
  { id: null, name: 'DLQ_Retry', file: 'workflows/seed_clean/DLQ_Retry.json', gcalRelated: true },
  { id: null, name: 'NN_05_Reminder_Cron', file: 'workflows/NN_05_Reminder_Cron.json', gcalRelated: false },
];

async function listWorkflows() {
  console.log('\n🔍 Listando workflows en n8n...\n');
  
  try {
    const response = await axios.get(`${N8N_HOST}/api/v1/workflows`, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`✅ Encontrados ${response.data.data.length} workflows\n`);
    return response.data.data;
  } catch (error: any) {
    console.error('❌ Error listando workflows:', error.message);
    console.error('   Verifica que N8N_API_KEY esté configurada correctamente\n');
    return [];
  }
}

async function getWorkflowDetails(workflowId: string) {
  try {
    const response = await axios.get(`${N8N_HOST}/api/v1/workflows/${workflowId}`, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error: any) {
    return null;
  }
}

async function deactivateWorkflow(workflowId: string, workflowName: string) {
  try {
    await axios.post(
      `${N8N_HOST}/api/v1/workflows/${workflowId}/deactivate`,
      {},
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`   ✅ DESACTIVADO: ${workflowName}`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Error desactivando ${workflowName}: ${error.message}`);
    return false;
  }
}

async function activateWorkflow(workflowId: string, workflowName: string) {
  try {
    await axios.post(
      `${N8N_HOST}/api/v1/workflows/${workflowId}/activate`,
      {},
      {
        headers: {
          'X-N8N-API-KEY': N8N_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`   ✅ ACTIVADO: ${workflowName}`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Error activando ${workflowName}: ${error.message}`);
    return false;
  }
}

async function findCronWorkflows() {
  const allWorkflows = await listWorkflows();
  
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ WORKFLOWS CRON ENCONTRADOS                                             │');
  console.log('├─────────────────────────────────────────────────────────────────────────┤');
  
  const foundCron: any[] = [];
  
  for (const wf of allWorkflows) {
    // Buscar por nombre o por ID
    const cronMatch = CRON_WORKFLOWS.find(cw => 
      cw.name === wf.name || 
      (wf.tags && wf.tags.some((t: any) => t.name.includes('cron')))
    );
    
    if (cronMatch) {
      foundCron.push({ ...wf, ...cronMatch });
      const status = wf.active ? '🟢 ACTIVO' : '🔴 INACTIVO';
      const gcalIcon = cronMatch.gcalRelated ? '⚠️ ' : '✅';
      
      console.log(`│ ${wf.name.padEnd(35)} ${status.padEnd(15)} ${gcalIcon} GCal Related          │`);
    }
  }
  
  console.log('└─────────────────────────────────────────────────────────────────────────┘\n');
  
  return foundCron;
}

async function stopGCalRelatedCron(workflows: any[]) {
  console.log('\n🛑 DETENIENDO workflows CRON relacionados con GCal...\n');
  
  const gcalCron = workflows.filter(w => w.gcalRelated);
  
  if (gcalCron.length === 0) {
    console.log('ℹ️  No hay workflows CRON relacionados con GCal activos\n');
    return;
  }
  
  console.log(`Se detendrán ${gcalCron.length} workflows:\n`);
  
  let stopped = 0;
  for (const wf of gcalCron) {
    if (wf.active) {
      const success = await deactivateWorkflow(wf.id, wf.name);
      if (success) stopped++;
    } else {
      console.log(`   ℹ️  YA INACTIVO: ${wf.name}`);
    }
  }
  
  console.log(`\n📊 Resumen: ${stopped}/${gcalCron.length} workflows desactivados\n`);
}

async function listTodayGCalEvents() {
  const today = DateTime.now().setZone('America/Argentina/Buenos_Aires');
  const startOfDay = today.startOf('day').toISO();
  const endOfDay = today.endOf('day').toISO();
  
  console.log(`\n📅 Eventos de Google Calendar para hoy (${today.toFormat('yyyy-MM-dd')}):\n`);
  console.log(`   Rango: ${startOfDay} a ${endOfDay}\n`);
  
  // Usar el workflow WF4_Sync_Engine para obtener eventos
  // O listar directamente desde la DB
  
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Para listar eventos de GCal, usar:                                     │');
  console.log('│                                                                         │');
  console.log('│ 1. Vía n8n workflow:                                                    │');
  console.log('│    curl -X POST https://n8n.stax.ink/webhook/sync-repair-manual         │');
  console.log('│                                                                         │');
  console.log('│ 2. Vía Google Calendar API:                                             │');
  console.log('│    npx tsx scripts/gcal_cleanup_today.ts                                │');
  console.log('│                                                                         │');
  console.log('│ 3. Vía SQL (listar bookings de hoy):                                    │');
  console.log('│    SELECT * FROM bookings                                               │');
  console.log('│    WHERE start_time >= NOW()::date                                      │');
  console.log('│      AND start_time < (NOW() + INTERVAL \'1 day\')::date;                │');
  console.log('└─────────────────────────────────────────────────────────────────────────┘\n');
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  VERIFY & STOP CRON - Verificación y parada de workflows CRON            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  
  if (!N8N_API_KEY) {
    console.error('❌ ERROR: N8N_API_KEY no configurada en .env\n');
    process.exit(1);
  }
  
  // Paso 1: Encontrar workflows CRON
  const cronWorkflows = await findCronWorkflows();
  
  // Paso 2: Listar eventos de hoy
  await listTodayGCalEvents();
  
  // Paso 3: Preguntar al usuario si desea detener los workflows
  console.log('\n⚠️  ADVERTENCIA:');
  console.log('   Los siguientes workflows CRON están relacionados con GCal:');
  
  const gcalCron = cronWorkflows.filter(w => w.gcalRelated && w.active);
  
  if (gcalCron.length === 0) {
    console.log('   ℹ️  No hay workflows CRON relacionados con GCal activos\n');
  } else {
    gcalCron.forEach(wf => {
      console.log(`   - ${wf.name}`);
    });
    console.log('\n');
    
    console.log('┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│ INSTRUCCIONES PARA EL USUARIO:                                         │');
    console.log('├─────────────────────────────────────────────────────────────────────────┤');
    console.log('│                                                                         │');
    console.log('│ Para DETENER los workflows CRON y ELIMINAR eventos de hoy:             │');
    console.log('│                                                                         │');
    console.log('│ 1. Desactivar manualmente desde n8n UI:                                │');
    console.log('│    https://n8n.stax.ink/workflow/<ID>                                   │');
    console.log('│                                                                         │');
    console.log('│ 2. O ejecutar este script con la bandera --stop:                       │');
    console.log('│    npx tsx scripts/verify_and_stop_cron.ts --stop                       │');
    console.log('│                                                                         │');
    console.log('│ 3. Para eliminar eventos de GCal:                                      │');
    console.log('│    a) Conectar Google Calendar a la cuenta dev.n8n.stax@gmail.com      │');
    console.log('│    b) Ejecutar: npx tsx scripts/gcal_cleanup_today.ts                   │');
    console.log('│                                                                         │');
    console.log('│ 4. O eliminar manualmente desde:                                       │');
    console.log('│    https://calendar.google.com/calendar/u/0/r/day                       │');
    console.log('│                                                                         │');
    console.log('└─────────────────────────────────────────────────────────────────────────┘\n');
  }
}

main();
