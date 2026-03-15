/**
 * Verifica reservas en DB y detecta solapamientos (colisiones)
 * Uso: npx tsx scripts-ts/check-overlapping-bookings.ts <YYYY-MM-DD>
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

interface Booking {
  id: string;
  provider_id: number;
  user_id: number;
  start_time: Date;
  end_time: Date;
  status: string;
  user_name?: string;
  short_code?: string;
}

interface Overlap {
  provider_id: number;
  booking1: Booking;
  booking2: Booking;
  overlap_minutes: number;
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

async function getBookings(client: any, fecha: string): Promise<Booking[]> {
  const query = `
    SELECT 
      b.id,
      b.provider_id,
      b.user_id,
      b.start_time,
      b.end_time,
      b.status,
      b.short_code,
      u.full_name as user_name
    FROM bookings b
    LEFT JOIN users u ON b.user_id = u.chat_id
    WHERE DATE(b.start_time AT TIME ZONE 'UTC' AT TIME ZONE '-03:00') = $1
    ORDER BY b.provider_id, b.start_time
  `;
  
  const result = await client.query(query, [fecha]);
  return result.rows as Booking[];
}

function detectOverlaps(bookings: Booking[]): Overlap[] {
  const overlaps: Overlap[] = [];
  
  // Agrupar por provider
  const byProvider = new Map<number, Booking[]>();
  bookings.forEach(b => {
    if (!byProvider.has(b.provider_id)) {
      byProvider.set(b.provider_id, []);
    }
    byProvider.get(b.provider_id)!.push(b);
  });
  
  // Detectar solapamientos por provider
  byProvider.forEach((providerBookings, providerId) => {
    for (let i = 0; i < providerBookings.length; i++) {
      for (let j = i + 1; j < providerBookings.length; j++) {
        const b1 = providerBookings[i];
        const b2 = providerBookings[j];
        
        // Verificar solapamiento: (start1 < end2) AND (start2 < end1)
        if (b1.start_time < b2.end_time && b2.start_time < b1.end_time) {
          // Calcular minutos de solapamiento
          const overlapStart = new Date(Math.max(b1.start_time.getTime(), b2.start_time.getTime()));
          const overlapEnd = new Date(Math.min(b1.end_time.getTime(), b2.end_time.getTime()));
          const overlapMinutes = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60);
          
          overlaps.push({
            provider_id: providerId,
            booking1: b1,
            booking2: b2,
            overlap_minutes: overlapMinutes
          });
        }
      }
    }
  });
  
  return overlaps;
}

async function run(): Promise<void> {
  const fecha = process.argv[2];
  
  if (!fecha) {
    console.error(`[ERROR] Falta la fecha.`);
    console.error(`  → Uso: npx tsx scripts-ts/check-overlapping-bookings.ts 2026-03-12`);
    process.exit(1);
  }

  const client = await pool.connect();
  
  try {
    const validatedDate = await validateDate(fecha);
    
    console.log('='.repeat(70));
    console.log('🔍 VERIFICACIÓN DE SOLAPAMIENTOS');
    console.log('='.repeat(70));
    console.log(`📅 Fecha: ${validatedDate}`);
    console.log(`🔗 DB: ${dbHost}/${dbName}`);
    console.log('');
    
    // 1. Obtener reservas
    console.log('[1/3] Obteniendo reservas...');
    const bookings = await getBookings(client, validatedDate);
    console.log(`    ✅ ${bookings.length} reserva(s) encontrada(s)`);
    console.log('');
    
    if (bookings.length === 0) {
      console.log('⚠️  No hay reservas para esta fecha.');
      return;
    }
    
    // 2. Detectar solapamientos
    console.log('[2/3] Detectando solapamientos...');
    const overlaps = detectOverlaps(bookings);
    
    if (overlaps.length > 0) {
      console.log(`    ❌ ${overlaps.length} solapamiento(s) detectado(s):\n`);
      
      overlaps.forEach((overlap, i) => {
        console.log(`    ┌─ Solapamiento #${i + 1}`);
        console.log(`    │ Provider ID: ${overlap.provider_id}`);
        console.log(`    │ Minutos solapados: ${overlap.overlap_minutes}`);
        console.log(`    │`);
        console.log(`    ├─ Reserva 1:`);
        console.log(`    │   ID: ${overlap.booking1.id}`);
        console.log(`    │   Usuario: ${overlap.booking1.user_name || 'N/A'}`);
        console.log(`    │   Horario: ${overlap.booking1.start_time.toISOString()} → ${overlap.booking1.end_time.toISOString()}`);
        console.log(`    │   Status: ${overlap.booking1.status}`);
        console.log(`    │`);
        console.log(`    └─ Reserva 2:`);
        console.log(`        ID: ${overlap.booking2.id}`);
        console.log(`        Usuario: ${overlap.booking2.user_name || 'N/A'}`);
        console.log(`        Horario: ${overlap.booking2.start_time.toISOString()} → ${overlap.booking2.end_time.toISOString()}`);
        console.log(`        Status: ${overlap.booking2.status}`);
        console.log('');
      });
    } else {
      console.log(`    ✅ Sin solapamientos (0)`);
    }
    console.log('');
    
    // 3. Listar todas las reservas
    console.log('[3/3] Detalle de reservas:');
    console.log('');
    console.log('┌──────┬────────────┬──────────────┬──────────────────────────┬──────────────┬───────────┐');
    console.log('│ Code │ Provider   │ Start Time   │ User Name                │ End Time     │ Status    │');
    console.log('├──────┼────────────┼──────────────┼──────────────────────────┼──────────────┼───────────┤');
    
    bookings.forEach((b, i) => {
      const code = (b.short_code || 'N/A').padEnd(4);
      const provider = String(b.provider_id).padEnd(10);
      const startTime = b.start_time.toISOString().substring(0, 16).padEnd(12);
      const userName = (b.user_name || 'Unknown').substring(0, 24).padEnd(24);
      const endTime = b.end_time.toISOString().substring(0, 16).padEnd(12);
      const status = b.status.padEnd(9);
      console.log(`│ ${code} │ ${provider} │ ${startTime} │ ${userName} │ ${endTime} │ ${status} │`);
    });
    
    console.log('└──────┴────────────┴──────────────┴──────────────────────────┴──────────────┴───────────┘');
    console.log('');
    
    // Resumen final
    console.log('='.repeat(70));
    console.log('📊 RESUMEN');
    console.log('='.repeat(70));
    console.log(`Total reservas:      ${bookings.length}`);
    console.log(`Solapamientos:       ${overlaps.length}`);
    console.log(`Providers afectados: ${new Set(overlaps.map(o => o.provider_id)).size}`);
    console.log('');
    
    if (overlaps.length > 0) {
      console.log('💡 RECOMENDACIONES:');
      console.log('   ⚠️  Hay reservas solapadas en el mismo provider.');
      console.log('   ⚠️  Revisar lógica de validación de slots en el DAL.');
      console.log('   ⚠️  Verificar si se usaron locks de base de datos (pg_advisory_xact_lock).');
    } else {
      console.log('   ✅ No hay solapamientos. Todo correcto.');
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
