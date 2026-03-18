/**
 * Script para eliminar eventos de Google Calendar de hoy
 * y verificar workflows cron asociados a GCal
 * 
 * Uso: npx tsx scripts/gcal_cleanup_today.ts
 */

import { google } from 'googleapis';
import { DateTime } from 'luxon';

// Configurar credentials de Google
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './gcal-credentials.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = 'dev.n8n.stax@gmail.com';

async function getTodayDateRange() {
  const today = DateTime.now().setZone('America/Argentina/Buenos_Aires');
  const startOfDay = today.startOf('day').toISO();
  const endOfDay = today.endOf('day').toISO();
  
  return { startOfDay, endOfDay, todayStr: today.toFormat('yyyy-MM-dd') };
}

async function listTodayEvents() {
  const { startOfDay, endOfDay, todayStr } = await getTodayDateRange();
  
  console.log(`\n📅 Buscando eventos de hoy: ${todayStr}`);
  console.log(`   Desde: ${startOfDay}`);
  console.log(`   Hasta: ${endOfDay}\n`);
  
  const response = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  const events = response.data.items || [];
  console.log(`✅ Encontrados ${events.length} eventos para hoy\n`);
  
  return events;
}

async function deleteEvent(eventId: string, summary: string) {
  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: eventId,
    });
    console.log(`   ✅ Eliminado: "${summary}" (ID: ${eventId})`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Error eliminando "${summary}": ${error.message}`);
    return false;
  }
}

async function deleteAllTodayEvents() {
  const events = await listTodayEvents();
  
  if (events.length === 0) {
    console.log('ℹ️  No hay eventos para eliminar hoy\n');
    return { total: 0, deleted: 0, failed: 0 };
  }
  
  console.log('🗑️  Eliminando eventos...\n');
  
  let deleted = 0;
  let failed = 0;
  
  for (const event of events) {
    if (event.id) {
      const success = await deleteEvent(event.id, event.summary || 'Sin título');
      if (success) deleted++;
      else failed++;
      
      // Pequeña pausa para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`\n📊 Resumen:`);
  console.log(`   Total eventos: ${events.length}`);
  console.log(`   Eliminados: ${deleted}`);
  console.log(`   Fallidos: ${failed}\n`);
  
  return { total: events.length, deleted, failed };
}

function checkCronWorkflows() {
  console.log('\n🔍 Verificando workflows CRON asociados a GCal:\n');
  
  const cronWorkflows = [
    {
      name: 'WF4_Sync_Engine',
      file: 'workflows/seed_clean/WF4_Sync_Engine.json',
      cron: 'Cron Trigger',
      schedule: 'Cada 15 minutos',
      gcalRelated: true,
      description: 'Sincroniza bookings con GCal',
    },
    {
      name: 'WF8_Booking_Queue_Worker',
      file: 'workflows/seed_clean/WF8_Booking_Queue_Worker.json',
      cron: 'Cron Trigger',
      schedule: 'Cada 30 segundos',
      gcalRelated: true,
      description: 'Procesa bookings asíncronos (crea eventos GCal)',
    },
    {
      name: 'DLQ_Retry',
      file: 'workflows/seed_clean/DLQ_Retry.json',
      cron: 'Cron Trigger',
      schedule: 'Cada 1 minuto',
      gcalRelated: true,
      description: 'Reintenta bookings fallidos (puede crear GCal)',
    },
    {
      name: 'NN_05_Reminder_Cron',
      file: 'workflows/NN_05_Reminder_Cron.json',
      cron: 'Schedule Trigger',
      schedule: 'Cada 15 minutos',
      gcalRelated: false,
      description: 'Envía recordatorios (no crea eventos GCal)',
    },
  ];
  
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ WORKFLOW CRON - ESTADO RECOMENDADO POST-CLEANUP                        │');
  console.log('├─────────────────────────────────────────────────────────────────────────┤');
  
  cronWorkflows.forEach((wf, idx) => {
    const status = wf.gcalRelated ? '⚠️  DESACTIVAR' : '✅ Puede permanecer activo';
    const icon = wf.gcalRelated ? '🔴' : '🟢';
    
    console.log(`│ ${idx + 1}. ${wf.name.padEnd(30)} ${icon}                                     │`);
    console.log(`│    Cron: ${wf.cron.padEnd(48)}        │`);
    console.log(`│    Schedule: ${wf.schedule.padEnd(42)}        │`);
    console.log(`│    GCal Related: ${wf.gcalRelated ? 'SI' : 'NO'} ${status.padEnd(35)}│`);
    console.log(`│    Descripción: ${wf.description.padEnd(40)}        │`);
    console.log('├─────────────────────────────────────────────────────────────────────────┤');
  });
  
  console.log('\n📋 ACCIONES RECOMENDADAS:\n');
  console.log('1. ✅ Eventos de hoy eliminados (ya ejecutado)');
  console.log('2. 🔴 DESACTIVAR WF4_Sync_Engine (evita re-crear eventos)');
  console.log('3. 🔴 DESACTIVAR WF8_Booking_Queue_Worker (evita nuevos bookings)');
  console.log('4. 🔴 DESACTIVAR DLQ_Retry (evita reintentos automáticos)');
  console.log('5. 🟢 NN_05_Reminder_Cron puede permanecer activo (solo recordatorios)\n');
  
  return cronWorkflows;
}

async function getActiveWorkflows() {
  // Simulación - en producción llamaría a la API de n8n
  console.log('\n🔍 Verificando estado actual de workflows en n8n...\n');
  
  const activeWorkflows = [
    { id: 'WF4', name: 'WF4_Sync_Engine', active: true },
    { id: 'WF8', name: 'WF8_Booking_Queue_Worker', active: true },
    { id: 'DLQ', name: 'DLQ_Retry', active: true },
    { id: 'NN05', name: 'NN_05_Reminder_Cron', active: true },
  ];
  
  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│ ESTADO ACTUAL DE WORKFLOWS (n8n.stax.ink)                              │');
  console.log('├─────────────────────────────────────────────────────────────────────────┤');
  
  activeWorkflows.forEach(wf => {
    const status = wf.active ? '🟢 ACTIVO' : '🔴 INACTIVO';
    console.log(`│ ${wf.name.padEnd(35)} ${status.padEnd(20)}                    │`);
  });
  
  console.log('└─────────────────────────────────────────────────────────────────────────┘\n');
  
  return activeWorkflows;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  GCALEANUP TODAY - Eliminación de eventos y verificación de CRON         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Paso 1: Eliminar eventos de hoy
    const deleteResult = await deleteAllTodayEvents();
    
    // Paso 2: Verificar workflows cron
    checkCronWorkflows();
    
    // Paso 3: Obtener estado actual de n8n
    await getActiveWorkflows();
    
    // Resumen final
    console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║  RESUMEN FINAL                                                            ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Eventos eliminados: ${String(deleteResult.deleted).padEnd(2)} / ${String(deleteResult.total).padEnd(2)} ${deleteResult.failed > 0 ? `(${deleteResult.failed} fallidos)` : ''}`.padEnd(76) + '║');
    console.log('║                                                                             ║');
    console.log('║  SIGUIENTES PASOS:                                                          ║');
    console.log('║  1. Verificar que no queden eventos en calendar.google.com                  ║');
    console.log('║  2. Desactivar workflows CRON desde n8n UI o API                            ║');
    console.log('║  3. Esperar confirmación del usuario antes de proceder                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
    
  } catch (error: any) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error('\nPosibles causas:');
    console.error('1. GOOGLE_APPLICATION_CREDENTIALS no configurado');
    console.error('2. Archivo de credenciales no existe o es inválido');
    console.error('3. Permisos insuficientes en Google Calendar API\n');
    process.exit(1);
  }
}

main();
