/**
 * SEED: Multi-Provider por Especialidad
 * 
 * Propósito: Asignar múltiples profesionales a especialidades médicas
 * para habilitar la lógica de selección de preferencia en la IA.
 * 
 * Uso: npx tsx scripts-ts/seed_multi_provider.ts [--dry-run]
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const isLocal = process.env.DATABASE_URL?.includes('localhost') ||
                process.env.DATABASE_URL?.includes('127.0.0.1') ||
                process.env.DATABASE_URL?.includes('postgres:');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// ============================================================================
// DATOS DE SEMILLA
// ============================================================================

/**
 * Especialidades con múltiples proveedores
 * Formato: { especialidad: [lista de proveedores] }
 */
const SPECIALTIES_DATA = {
    'Médico General': [
        { name: 'Dr. Roberto García', email: 'roberto.garcia@booking-titanium.com', is_active: true },
        { name: 'Dra. María López', email: 'maria.lopez@booking-titanium.com', is_active: true },
        { name: 'Dr. Carlos Mendoza', email: 'carlos.mendoza@booking-titanium.com', is_active: true },
    ],
    'Pediatría': [
        { name: 'Dra. Ana Rodríguez', email: 'ana.rodriguez@booking-titanium.com', is_active: true },
        { name: 'Dr. Luis Fernández', email: 'luis.fernandez@booking-titanium.com', is_active: true },
        { name: 'Dra. Carmen Silva', email: 'carmen.silva@booking-titanium.com', is_active: true },
    ],
    'Cardiología': [
        { name: 'Dr. Jorge Ramírez', email: 'jorge.ramirez@booking-titanium.com', is_active: true },
        { name: 'Dra. Patricia Torres', email: 'patricia.torres@booking-titanium.com', is_active: true },
        { name: 'Dr. Miguel Ángel Díaz', email: 'miguel.diaz@booking-titanium.com', is_active: true },
    ],
    'Dermatología': [
        { name: 'Dra. Sofía Herrera', email: 'sofia.herrera@booking-titanium.com', is_active: true },
        { name: 'Dr. Andrés Morales', email: 'andres.morales@booking-titanium.com', is_active: true },
        { name: 'Dra. Isabel Vargas', email: 'isabel.vargas@booking-titanium.com', is_active: true },
    ],
    'Ginecología': [
        { name: 'Dra. Laura Jiménez', email: 'laura.jimenez@booking-titanium.com', is_active: true },
        { name: 'Dra. Patricia Ruiz', email: 'patricia.ruiz@booking-titanium.com', is_active: true },
    ],
    'Traumatología': [
        { name: 'Dr. Fernando Castro', email: 'fernando.castro@booking-titanium.com', is_active: true },
        { name: 'Dr. Ricardo Ortiz', email: 'ricardo.ortiz@booking-titanium.com', is_active: true },
    ],
};

/**
 * Duración estándar por especialidad (minutos)
 */
const SERVICE_DURATION: Record<string, number> = {
    'Médico General': 30,
    'Pediatría': 40,
    'Cardiología': 45,
    'Dermatología': 30,
    'Ginecología': 40,
    'Traumatología': 45,
};

/**
 * Buffer entre consultas (minutos)
 */
const SERVICE_BUFFER = 15;

/**
 * Horarios estándar (Lunes a Viernes) - UN solo turno por día (restricción de BD)
 * Formato: { day_of_week: 1-5 (Lun-Vie), start_time, end_time }
 * Nota: La tabla provider_schedules tiene unique index (provider_id, day_of_week)
 */
const STANDARD_SCHEDULE = [
    { day_of_week: 1, start_time: '09:00', end_time: '19:00' }, // Lunes continuo
    { day_of_week: 2, start_time: '09:00', end_time: '19:00' }, // Martes continuo
    { day_of_week: 3, start_time: '09:00', end_time: '19:00' }, // Miércoles continuo
    { day_of_week: 4, start_time: '09:00', end_time: '19:00' }, // Jueves continuo
    { day_of_week: 5, start_time: '09:00', end_time: '19:00' }, // Viernes continuo
];

// ============================================================================
// FUNCIONES DE BASE DE DATOS
// ============================================================================

async function ensureTablesExist(): Promise<void> {
    console.log('📋 Verificando estructura de tablas...');

    const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('providers', 'services', 'provider_services', 'provider_schedules')
        ORDER BY table_name;
    `;

    const result = await pool.query(tablesQuery);
    const existingTables = result.rows.map(r => r.table_name);

    const requiredTables = ['providers', 'services', 'provider_services', 'provider_schedules'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
        throw new Error(
            `Tablas faltantes: ${missingTables.join(', ')}. ` +
            'Ejecutar primero migración de schema.'
        );
    }

    console.log('✅ Estructura verificada:', existingTables.join(', '));
}

async function getOrCreateService(serviceName: string, durationMin: number, bufferMin: number): Promise<number> {
    // Buscar servicio existente
    const selectQuery = `SELECT id FROM public.services WHERE name = $1::text;`;
    const result = await pool.query(selectQuery, [serviceName]);

    if (result.rows.length > 0) {
        console.log(`  ✓ Servicio existente: "${serviceName}" (ID: ${result.rows[0].id})`);
        return result.rows[0].id;
    }

    // Crear nuevo servicio
    const insertQuery = `
        INSERT INTO public.services (name, duration_min, buffer_min)
        VALUES ($1::text, $2::integer, $3::integer)
        RETURNING id;
    `;
    const insertResult = await pool.query(insertQuery, [serviceName, durationMin, bufferMin]);
    const newId = insertResult.rows[0].id;

    console.log(`  ✨ Servicio creado: "${serviceName}" (ID: ${newId})`);
    return newId;
}

async function getOrCreateProvider(providerName: string, email: string, isActive: boolean): Promise<number> {
    // Buscar proveedor existente
    const selectQuery = `SELECT id FROM public.providers WHERE name = $1::text;`;
    const result = await pool.query(selectQuery, [providerName]);

    if (result.rows.length > 0) {
        console.log(`    ✓ Proveedor existente: "${providerName}" (ID: ${result.rows[0].id})`);
        return result.rows[0].id;
    }

    // Crear nuevo proveedor
    const insertQuery = `
        INSERT INTO public.providers (name, email, gcal_calendar_id, is_active)
        VALUES ($1::text, $2::text, $3::text, $4::boolean)
        RETURNING id;
    `;
    // Generate gcal_calendar_id from email
    const gcalCalendarId = email.replace('@booking-titanium.com', '@booking-titanium.com');
    const insertResult = await pool.query(insertQuery, [providerName, email, gcalCalendarId, isActive]);
    const newId = insertResult.rows[0].id;

    console.log(`    ✨ Proveedor creado: "${providerName}" (ID: ${newId})`);
    return newId;
}

async function linkProviderToService(providerId: number, serviceId: number): Promise<boolean> {
    // Verificar si ya existe el link
    const checkQuery = `
        SELECT 1 FROM public.provider_services
        WHERE provider_id = $1::integer AND service_id = $2::integer;
    `;
    const checkResult = await pool.query(checkQuery, [providerId, serviceId]);

    if (checkResult.rows.length > 0) {
        console.log(`      ⚠️  Ya vinculado: Provider ${providerId} → Service ${serviceId}`);
        return false;
    }

    // Crear link
    const insertQuery = `
        INSERT INTO public.provider_services (provider_id, service_id)
        VALUES ($1::integer, $2::integer);
    `;
    await pool.query(insertQuery, [providerId, serviceId]);
    console.log(`      ✅ Vinculado: Provider ${providerId} → Service ${serviceId}`);
    return true;
}

async function createProviderSchedule(
    providerId: number,
    schedules: Array<{ day_of_week: number; start_time: string; end_time: string }>
): Promise<number> {
    // Verificar si ya tiene horarios este proveedor
    const checkQuery = `
        SELECT COUNT(*) as count FROM public.provider_schedules
        WHERE provider_id = $1::integer;
    `;
    const checkResult = await pool.query(checkQuery, [providerId]);
    const existingCount = parseInt(checkResult.rows[0].count);

    if (existingCount > 0) {
        console.log(`      ⚠️  Ya tiene ${existingCount} horarios registrados`);
        return 0;
    }

    // Insertar horarios
    let insertedCount = 0;
    for (const schedule of schedules) {
        try {
            const insertQuery = `
                INSERT INTO public.provider_schedules (provider_id, day_of_week, start_time, end_time)
                VALUES ($1::integer, $2::integer, $3::time, $4::time);
            `;
            await pool.query(insertQuery, [
                providerId,
                schedule.day_of_week,
                schedule.start_time,
                schedule.end_time,
            ]);
            insertedCount++;
        } catch (error) {
            // Ignorar errores de duplicados (ON CONFLICT no funciona con unique index compuesto)
            const err = error as Error;
            if (!err.message.includes('duplicate key')) {
                throw error;
            }
        }
    }

    if (insertedCount > 0) {
        console.log(`      📅 ${insertedCount} horarios agregados`);
    }
    return insertedCount;
}

// ============================================================================
// PROCESO PRINCIPAL
// ============================================================================

async function seedDatabase(dryRun = false): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  SEED: Multi-Provider por Especialidad                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    if (dryRun) {
        console.log('⚠️  MODO DRY-RUN: No se harán cambios en la BD\n');
    } else {
        console.log('🔥 MODO EJECUCIÓN: Los cambios se aplicarán\n');
    }

    try {
        // 1. Verificar estructura
        await ensureTablesExist();
        console.log('');

        // 2. Procesar cada especialidad
        for (const [specialtyName, providers] of Object.entries(SPECIALTIES_DATA)) {
            console.log(`═══════════════════════════════════════════════════════════`);
            console.log(`📌 Especialidad: "${specialtyName}"`);
            console.log(`═══════════════════════════════════════════════════════════`);

            // Obtener o crear servicio
            const duration = SERVICE_DURATION[specialtyName] || 30;
            const serviceId = await getOrCreateService(specialtyName, duration, SERVICE_BUFFER);

            // Procesar cada proveedor
            for (const provider of providers) {
                console.log(`\n  👤 Proveedor: "${provider.name}"`);

                // Obtener o crear proveedor
                const providerId = await getOrCreateProvider(provider.name, provider.email, provider.is_active);

                // Vincular proveedor al servicio
                if (!dryRun) {
                    await linkProviderToService(providerId, serviceId);

                    // Crear horarios estándar
                    await createProviderSchedule(providerId, STANDARD_SCHEDULE);
                } else {
                    console.log(`      [DRY-RUN] Se vincularía Provider ${providerId} → Service ${serviceId}`);
                    console.log(`      [DRY-RUN] Se agregarían ${STANDARD_SCHEDULE.length} horarios`);
                }
            }

            console.log('');
        }

        // 3. Resumen final
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  RESUMEN                                                     ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');

        const summaryQuery = `
            SELECT 
                s.name as especialidad,
                COUNT(DISTINCT ps.provider_id) as proveedores_count,
                string_agg(DISTINCT p.name, ', ') as proveedores
            FROM public.services s
            JOIN public.provider_services ps ON s.id = ps.service_id
            JOIN public.providers p ON ps.provider_id = p.id
            WHERE s.name = ANY($1::text[])
            GROUP BY s.name
            ORDER BY s.name;
        `;

        const summaryResult = await pool.query(summaryQuery, [
            Object.keys(SPECIALTIES_DATA),
        ]);

        console.log('');
        console.log('Especialidad          | Proveedores | Nombres');
        console.log('──────────────────────┼─────────────┼──────────────────────────────────────');

        for (const row of summaryResult.rows) {
            const countStr = row.proveedores_count.toString().padEnd(11);
            console.log(`${row.especialidad.padEnd(21)} | ${countStr} | ${row.proveedores}`);
        }

        console.log('');
        console.log(dryRun ? '✅ DRY-RUN completado (sin cambios)' : '✅ SEED completado exitosamente');
        console.log('');

    } catch (error) {
        console.error('❌ ERROR:', (error as Error).message);
        throw error;
    } finally {
        await pool.end();
    }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

const [, , ...args] = process.argv;
const isDryRun = args.includes('--dry-run');

seedDatabase(isDryRun)
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal:', err.message);
        process.exit(1);
    });
