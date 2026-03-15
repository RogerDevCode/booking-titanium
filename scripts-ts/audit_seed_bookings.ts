/**
 * =============================================================================
 * audit_seed_bookings.ts
 * =============================================================================
 * Auditoría de reservas SEED: verifica integridad y detecta colisiones.
 * 
 * USO:
 *   npx tsx scripts-ts/audit_seed_bookings.ts <YYYY-MM-DD>
 * 
 * EJEMPLO:
 *   npx tsx scripts-ts/audit_seed_bookings.ts 2026-03-13
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const dbUser = process.env.REMOTE_NEON_DB_USER;
const dbPass = process.env.REMOTE_NEON_DB_PASSWORD;
const dbHost = process.env.REMOTE_NEON_DB_HOST;
const dbPort = process.env.REMOTE_NEON_DB_PORT;
const dbName = process.env.REMOTE_NEON_DB_DATABASE;

const url = `postgres://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;

const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

interface BookingAudit {
  id: string;
  provider_id: number;
  start_time: string;
  user_name: string;
  user_email: string;
  gcal_event_id: string | null;
  status: string;
  short_code: string;
}

interface Collision {
  provider_id: number;
  start_time: string;
  bookings: BookingAudit[];
}

async function validateDate(fecha: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error(`[ERROR] Formato de fecha inválido: '${fecha}'. Use YYYY-MM-DD`);
  }
  if (isNaN(new Date(fecha).getTime())) {
    throw new Error(`[ERROR] '${fecha}' no es una fecha válida.`);
  }
  return fecha;
}

async function getSeedBookings(client: any, fecha: string): Promise<BookingAudit[]> {
  // Buscamos reservas de usuarios seed (chat_id >= 9800000)
  // Nota: users.chat_id es la PK, bookings.user_id es FK -> users.chat_id
  const query = `
    SELECT 
      b.id,
      b.provider_id,
      b.start_time,
      u.full_name as user_name,
      u.email as user_email,
      b.gcal_event_id,
      b.status,
      b.short_code
    FROM bookings b
    JOIN users u ON b.user_id = u.chat_id
    WHERE u.chat_id >= 9800000
      AND DATE(b.start_time AT TIME ZONE 'UTC' AT TIME ZONE '-03:00') = $1
    ORDER BY b.provider_id, b.start_time
  `;
  
  const result = await client.query(query, [fecha]);
  return result.rows as BookingAudit[];
}

async function detectCollisions(bookings: BookingAudit[]): Promise<Collision[]> {
  const collisions: Collision[] = [];
  const timeSlots = new Map<string, BookingAudit[]>();
  
  // Agrupar por provider_id + start_time
  bookings.forEach(booking => {
    const key = `${booking.provider_id}-${booking.start_time}`;
    if (!timeSlots.has(key)) {
      timeSlots.set(key, []);
    }
    timeSlots.get(key)!.push(booking);
  });
  
  // Detectar colisiones (más de 1 booking en mismo slot)
  timeSlots.forEach((bookingList, key) => {
    if (bookingList.length > 1) {
      const [providerId] = key.split('-').map(Number);
      const [, startTime] = key.split('-');
      collisions.push({
        provider_id: providerId,
        start_time: startTime,
        bookings: bookingList
      });
    }
  });
  
  return collisions;
}

async function checkGcalSync(bookings: BookingAudit[]): Promise<{ synced: number; missing: number }> {
  const synced = bookings.filter(b => b.gcal_event_id !== null).length;
  const missing = bookings.filter(b => b.gcal_event_id === null).length;
  return { synced, missing };
}

async function run(): Promise<void> {
  const fecha = process.argv[2];
  
  if (!fecha) {
    console.error(`[ERROR] Falta la fecha.`);
    console.error(`  → Uso: npx tsx scripts-ts/audit_seed_bookings.ts 2026-03-13`);
    process.exit(1);
  }

  const client = await pool.connect();
  
  try {
    const validatedDate = await validateDate(fecha);
    
    console.log('='.repeat(70));
    console.log('🔍 AUDITORÍA SEED BOOKINGS');
    console.log('='.repeat(70));
    console.log(`📅 Fecha auditada: ${validatedDate}`);
    console.log(`🔗 DB: ${dbHost}/${dbName}`);
    console.log('');
    
    // 1. Obtener reservas seed
    console.log('[1/4] Obteniendo reservas SEED...');
    const bookings = await getSeedBookings(client, validatedDate);
    console.log(`    ✅ ${bookings.length} reserva(s) encontrada(s)`);
    console.log('');
    
    if (bookings.length === 0) {
      console.log('⚠️  No hay reservas SEED para esta fecha.');
      console.log('');
      console.log('💡 Sugerencia: Ejecuta el workflow SEED_Book_Tomorrow primero.');
      return;
    }
    
    // 2. Detectar colisiones
    console.log('[2/4] Detectando colisiones horarias...');
    const collisions = await detectCollisions(bookings);
    
    if (collisions.length > 0) {
      console.log(`    ❌ ${collisions.length} colisión(es) detectada(s):`);
      collisions.forEach((collision, i) => {
        console.log(`\n    Colisión #${i + 1}:`);
        console.log(`      Provider ID: ${collision.provider_id}`);
        console.log(`      Start Time:  ${collision.start_time}`);
        console.log(`      Reservas:    ${collision.bookings.length}`);
        collision.bookings.forEach((b, j) => {
          console.log(`        [${j + 1}] ${b.user_name} (${b.user_email}) - ID: ${b.id}`);
        });
      });
    } else {
      console.log(`    ✅ Sin colisiones (0)`);
    }
    console.log('');
    
    // 3. Verificar sync con GCAL
    console.log('[3/4] Verificando sincronización con Google Calendar...');
    const syncStats = await checkGcalSync(bookings);
    console.log(`    ✅ Sincronizadas: ${syncStats.synced}`);
    console.log(`    ❌ Faltantes:     ${syncStats.missing}`);
    
    if (syncStats.missing > 0) {
      console.log('\n    Reservas sin gcal_event_id:');
      bookings
        .filter(b => b.gcal_event_id === null)
        .forEach(b => {
          console.log(`      - ${b.user_name} (${b.start_time}) - ID: ${b.id}`);
        });
    }
    console.log('');
    
    // 4. Listar todas las reservas
    console.log('[4/4] Detalle de reservas:');
    console.log('');
    console.log('┌─────┬────────────┬─────────────────────┬──────────────────────────────┬──────────────┬───────────┐');
    console.log('│ #   │ Provider   │ Start Time          │ User Name                    │ GCAL Event   │ Status    │');
    console.log('├─────┼────────────┼─────────────────────┼──────────────────────────────┼──────────────┼───────────┤');
    
    bookings.forEach((b, i) => {
      const num = String(i + 1).padStart(3);
      const provider = String(b.provider_id).padEnd(10);
      const startTime = b.start_time.substring(0, 19).padEnd(19);
      const userName = b.user_name.substring(0, 28).padEnd(28);
      const gcal = (b.gcal_event_id || 'NULL').substring(0, 12).padEnd(12);
      const status = b.status.padEnd(9);
      console.log(`│ ${num} │ ${provider} │ ${startTime} │ ${userName} │ ${gcal} │ ${status} │`);
    });
    
    console.log('└─────┴────────────┴─────────────────────┴──────────────────────────────┴──────────────┴───────────┘');
    console.log('');
    
    // Resumen final
    console.log('='.repeat(70));
    console.log('📊 RESUMEN DE AUDITORÍA');
    console.log('='.repeat(70));
    console.log(`Total reservas:      ${bookings.length}`);
    console.log(`Colisiones:          ${collisions.length}`);
    console.log(`Sync GCAL:           ${syncStats.synced}/${bookings.length} (${Math.round(syncStats.synced / bookings.length * 100)}%)`);
    console.log(`Faltantes GCAL:      ${syncStats.missing}`);
    console.log('');
    
    // Recomendaciones
    console.log('💡 RECOMENDACIONES:');
    if (collisions.length > 0) {
      console.log('   ⚠️  Hay colisiones horarias. Revisar lógica de slots en SEED_Book_Tomorrow.');
    }
    if (syncStats.missing > 0) {
      console.log('   ⚠️  Hay reservas sin sincronizar con GCAL. Revisar mapping en SUB_Seed_Single_Booking.');
    }
    if (collisions.length === 0 && syncStats.missing === 0) {
      console.log('   ✅ Todo correcto. No se requieren acciones.');
    }
    console.log('');
    
  } catch (e) {
    console.error(`\n[ERROR] ${(e as Error).message}`);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

run();
