/**
 * Script de diagnóstico y eliminación DIRECTA de eventos de GCal
 * Usa axios directamente para evitar problemas con googleapis
 */

import axios from 'axios';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/home/manager/Sync/N8N_Projects/booking-titanium/.env' });

const TOKEN_FILE = 'token.json';
const CALENDAR_ID = 'dev.n8n.stax@gmail.com';

async function getAccessToken(): Promise<string> {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  
  // Check if token needs refresh
  if (new Date(tokens.expiry_date).getTime() < Date.now() + 300000) { // 5 min buffer
    console.log('🔄 Refreshing expired token...');
    
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GCAL_CLIENT_ID,
      client_secret: process.env.GCAL_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token'
    });
    
    tokens.access_token = response.data.access_token;
    tokens.expiry_date = Date.now() + (response.data.expires_in * 1000);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log('✅ Token refreshed');
  }
  
  return tokens.access_token;
}

async function listEvents(accessToken: string): Promise<any[]> {
  const timeMin = '2026-03-17T00:00:00-03:00';
  const timeMax = '2026-03-17T23:59:59-03:00';
  
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events` +
    `?timeMin=${encodeURIComponent(timeMin)}` +
    `&timeMax=${encodeURIComponent(timeMax)}` +
    `&showDeleted=false` +
    `&singleEvents=true` +
    `&orderBy=startTime`;
  
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data.items || [];
}

async function deleteEvent(accessToken: string, eventId: string): Promise<boolean> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`;
  
  try {
    const response = await axios.delete(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.status === 200;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log(`   ⚠️  Evento ya eliminado: ${eventId}`);
      return true;
    }
    console.log(`   ❌ Error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
    return false;
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  GCal DIRECT DELETE - Diagnóstico y Eliminación                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
  
  try {
    // 1. Get fresh access token
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtenido\n');
    
    // 2. List events
    console.log('📅 Listando eventos del 2026-03-17...\n');
    const events = await listEvents(accessToken);
    console.log(`📊 Total eventos encontrados: ${events.length}\n`);
    
    if (events.length === 0) {
      console.log('✅ No hay eventos para eliminar');
      return;
    }
    
    // 3. Show first 5 events
    console.log('Primeros 5 eventos:');
    events.slice(0, 5).forEach((e, i) => {
      console.log(`  [${i+1}] ${e.id} - ${e.start?.dateTime || e.start?.date}`);
    });
    console.log('');
    
    // 4. Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise<string>(resolve => {
      readline.question(`¿Eliminar TODOS los ${events.length} eventos? (yes/no): `, resolve);
    });
    readline.close();
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('\n❌ Operación cancelada');
      return;
    }
    
    // 5. Delete all events
    console.log('\n🗑️  Eliminando eventos...\n');
    
    let deleted = 0;
    let failed = 0;
    
    for (const event of events) {
      const success = await deleteEvent(accessToken, event.id);
      if (success) {
        deleted++;
        console.log(`   ✅ ${event.id}`);
      } else {
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 6. Summary
    console.log('\n' + '═'.repeat(70));
    console.log('📊 RESUMEN:');
    console.log('─'.repeat(70));
    console.log(`   Eliminados: ${deleted}`);
    console.log(`   Fallidos: ${failed}`);
    console.log(`   Total: ${events.length}`);
    console.log('═'.repeat(70) + '\n');
    
    // 7. Verify
    console.log('🔍 Verificando eliminación...\n');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    
    const remaining = await listEvents(accessToken);
    console.log(`📊 Eventos restantes: ${remaining.length}`);
    
    if (remaining.length === 0) {
      console.log('\n✅ ¡LIMPIEZA COMPLETADA EXITOSAMENTE!\n');
    } else {
      console.log(`\n⚠️  Aún quedan ${remaining.length} eventos. Posibles causas:`);
      console.log('   1. Caché de API (esperar 5-15 minutos)');
      console.log('   2. Eventos recurrentes (requieren manejo especial)');
      console.log('   3. Problema de permisos\n');
    }
    
  } catch (error: any) {
    console.error('\n❌ ERROR FATAL:', error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
