/**
 * QA Test Database Seeder
 * 
 * Purpose: Prepare database with known state for QA testing
 * - Creates test providers if none exist
 * - Creates test services
 * - Sets up test schedules
 * - Optionally clears existing test data
 *
 * Usage: npx tsx scripts-ts/seed_qa_database.ts [--clean] [--dry-run]
 */

import { Pool } from 'pg';
import { DateTime } from 'luxon';

const DATABASE_URL = process.env.DATABASE_URL || process.env.REMOTE_NEON_DB_URL;

const isLocal = DATABASE_URL?.includes('localhost') ||
                DATABASE_URL?.includes('127.0.0.1') ||
                DATABASE_URL?.includes('postgres:');

// SSL configuration: try with SSL first, fallback to no SSL if not supported
const sslConfig = isLocal ? false : { rejectUnauthorized: false };

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: sslConfig,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Helper to recreate pool without SSL if needed
async function recreatePoolWithoutSsl(): Promise<void> {
    await pool.end();
    const newPool = new Pool({
        connectionString: DATABASE_URL,
        ssl: false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    });
    // Replace global pool reference (hack for simplicity)
    (global as any)._qaPool = newPool;
}

// ============================================================================
// QA TEST DATA
// ============================================================================

const QA_TEST_PROVIDERS = [
    { name: 'Dr. QA Test Provider 1', email: 'qa.test1@booking-titanium.test' },
    { name: 'Dra. QA Test Provider 2', email: 'qa.test2@booking-titanium.test' },
];

const QA_TEST_SERVICES = [
    { name: 'Consulta General QA', duration_min: 30, buffer_min: 15 },
    { name: 'Consulta Especializada QA', duration_min: 45, buffer_min: 15 },
];

const QA_SCHEDULE = [
    { day_of_week: 1, start_time: '09:00', end_time: '18:00' }, // Lunes
    { day_of_week: 2, start_time: '09:00', end_time: '18:00' }, // Martes
    { day_of_week: 3, start_time: '09:00', end_time: '18:00' }, // Miércoles
    { day_of_week: 4, start_time: '09:00', end_time: '18:00' }, // Jueves
    { day_of_week: 5, start_time: '09:00', end_time: '18:00' }, // Viernes
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function ensureTablesExist(): Promise<void> {
    console.log('📋 Verificando estructura de tablas...');

    const tablesQuery = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('providers', 'services', 'provider_services', 'provider_schedules', 'bookings', 'users')
        ORDER BY table_name;
    `;

    const result = await pool.query(tablesQuery);
    const existingTables = result.rows.map(r => r.table_name);

    const requiredTables = ['providers', 'services', 'provider_services', 'provider_schedules', 'bookings', 'users'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
        throw new Error(
            `Tablas faltantes: ${missingTables.join(', ')}. ` +
            'Ejecutar primero migración de schema (schema.sql).'
        );
    }

    console.log(`✅ Estructura verificada: ${existingTables.join(', ')}\n`);
}

async function cleanTestData(): Promise<void> {
    console.log('🧹 Limpiando datos de test anteriores...\n');

    try {
        // Delete test bookings (chat_id >= TELEGRAM_ID + 1000)
        const telegramId = Number(process.env.TELEGRAM_ID || 5391760292);
        const testChatIdThreshold = telegramId + 1000;

        const deleteBookings = await pool.query(
            `DELETE FROM public.bookings WHERE user_id >= $1`,
            [testChatIdThreshold]
        );
        console.log(`   ✓ Deleted ${deleteBookings.rowCount} test bookings`);

        const deleteUsers = await pool.query(
            `DELETE FROM public.users WHERE chat_id >= $1`,
            [testChatIdThreshold]
        );
        console.log(`   ✓ Deleted ${deleteUsers.rowCount} test users`);

        const deleteWaitlist = await pool.query(
            `DELETE FROM public.waitlist WHERE user_id >= $1`,
            [testChatIdThreshold]
        );
        console.log(`   ✓ Deleted ${deleteWaitlist.rowCount} waitlist entries\n`);

    } catch (error) {
        console.error('   ⚠️  Cleanup error:', (error as Error).message);
    }
}

async function getOrCreateService(serviceName: string, durationMin: number, bufferMin: number): Promise<number> {
    const selectQuery = `SELECT id FROM public.services WHERE name = $1::text;`;
    const result = await pool.query(selectQuery, [serviceName]);

    if (result.rows.length > 0) {
        console.log(`  ✓ Servicio existente: "${serviceName}" (ID: ${result.rows[0].id})`);
        return result.rows[0].id;
    }

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

async function getOrCreateProvider(providerName: string, email: string): Promise<number> {
    const selectQuery = `SELECT id FROM public.providers WHERE name = $1::text;`;
    const result = await pool.query(selectQuery, [providerName]);

    if (result.rows.length > 0) {
        console.log(`    ✓ Proveedor existente: "${providerName}" (ID: ${result.rows[0].id})`);
        return result.rows[0].id;
    }

    const insertQuery = `
        INSERT INTO public.providers (name, email, gcal_calendar_id, is_active)
        VALUES ($1::text, $2::text, $3::text, $4::boolean)
        RETURNING id;
    `;
    const gcalCalendarId = email;
    const insertResult = await pool.query(insertQuery, [providerName, email, gcalCalendarId, true]);
    const newId = insertResult.rows[0].id;

    console.log(`    ✨ Proveedor creado: "${providerName}" (ID: ${newId})`);
    return newId;
}

async function linkProviderToService(providerId: number, serviceId: number): Promise<void> {
    const checkQuery = `
        SELECT 1 FROM public.provider_services
        WHERE provider_id = $1::integer AND service_id = $2::integer;
    `;
    const checkResult = await pool.query(checkQuery, [providerId, serviceId]);

    if (checkResult.rows.length > 0) {
        console.log(`      ⚠️  Ya vinculado`);
        return;
    }

    const insertQuery = `
        INSERT INTO public.provider_services (provider_id, service_id)
        VALUES ($1::integer, $2::integer);
    `;
    await pool.query(insertQuery, [providerId, serviceId]);
    console.log(`      ✅ Vinculado: Provider ${providerId} → Service ${serviceId}`);
}

async function createProviderSchedule(
    providerId: number,
    schedules: Array<{ day_of_week: number; start_time: string; end_time: string }>
): Promise<number> {
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
// MAIN SEED FUNCTION
// ============================================================================

async function seedQADatabase(clean: boolean = false, dryRun: boolean = false): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  QA Test Database Seeder                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    if (dryRun) {
        console.log('⚠️  MODO DRY-RUN: No se harán cambios en la BD\n');
    } else {
        console.log('🔥 MODO EJECUCIÓN: Los cambios se aplicarán\n');
    }

    try {
        // Step 1: Verify structure
        await ensureTablesExist();

        // Step 2: Clean test data if requested
        if (clean && !dryRun) {
            await cleanTestData();
        } else if (clean && dryRun) {
            console.log('🧹 [DRY-RUN] Would clean test data\n');
        }

        // Step 3: Check if providers already exist
        const providerCheck = await pool.query(
            `SELECT COUNT(*) as count FROM public.providers WHERE is_active = TRUE`
        );

        const existingProviderCount = parseInt(providerCheck.rows[0].count);
        console.log(`📊 Existing active providers: ${existingProviderCount}\n`);

        if (existingProviderCount > 0) {
            console.log('✅ Database already has providers. Skipping QA provider creation.\n');
            console.log('   You can run with --force to create QA-specific providers.\n');
        } else {
            console.log('📌 Creating QA Test Providers and Services...\n');

            // Step 4: Create QA test services
            for (const service of QA_TEST_SERVICES) {
                const serviceId = await getOrCreateService(service.name, service.duration_min, service.buffer_min);

                // Create QA test providers
                for (const provider of QA_TEST_PROVIDERS) {
                    console.log(`\n  👤 Proveedor: "${provider.name}"`);
                    const providerId = await getOrCreateProvider(provider.name, provider.email);

                    if (!dryRun) {
                        await linkProviderToService(providerId, serviceId);
                        await createProviderSchedule(providerId, QA_SCHEDULE);
                    } else {
                        console.log(`      [DRY-RUN] Would link Provider ${providerId} → Service ${serviceId}`);
                        console.log(`      [DRY-RUN] Would add ${QA_SCHEDULE.length} schedules`);
                    }
                }
            }
        }

        // Step 5: Summary
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║  RESUMEN                                                     ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');

        const summaryQuery = `
            SELECT
                p.name as proveedor,
                p.email,
                s.name as servicio,
                COUNT(ps_s.id) as horarios_count
            FROM public.providers p
            JOIN public.provider_services ps ON p.id = ps.provider_id
            JOIN public.services s ON ps.service_id = s.id
            LEFT JOIN public.provider_schedules ps_s ON p.id = ps_s.provider_id
            WHERE p.email LIKE '%qa.test%' OR p.email LIKE '%booking-titanium.test'
            GROUP BY p.name, p.email, s.name
            ORDER BY p.name, s.name;
        `;

        const summaryResult = await pool.query(summaryQuery);

        if (summaryResult.rows.length === 0) {
            console.log('   No QA-specific providers found (expected if DB already seeded)\n');
        } else {
            console.log('Proveedor              | Email                              | Servicio                    | Horarios');
            console.log('───────────────────────┼────────────────────────────────────┼─────────────────────────────┼─────────');

            for (const row of summaryResult.rows) {
                const horariosStr = row.horarios_count.toString().padEnd(7);
                console.log(`${row.proveedor.padEnd(21)} | ${row.email.padEnd(34)} | ${row.servicio.padEnd(27)} | ${horariosStr}`);
            }
            console.log('');
        }

        console.log(dryRun ? '✅ DRY-RUN completado (sin cambios)' : '✅ QA Database ready for testing');
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
const isClean = args.includes('--clean');
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

if (isForce) {
    // Force mode: clean and recreate
    seedQADatabase(true, isDryRun)
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Fatal:', err.message);
            process.exit(1);
        });
} else {
    seedQADatabase(isClean, isDryRun)
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Fatal:', err.message);
            process.exit(1);
        });
}
