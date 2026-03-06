/**
 * VERIFY: Multi-Provider Seed
 * 
 * Propósito: Verificar que el seed de multi-proveedores se aplicó correctamente
 * 
 * Uso: npx tsx scripts-ts/verify_seed_multi_provider.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

async function verifySeed(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  VERIFY: Multi-Provider Seed                                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        // 1. Contar proveedores por especialidad
        console.log('📊 ESPECIALIDADES Y PROVEEDORES');
        console.log('═══════════════════════════════════════════════════════════');

        const specialtyQuery = `
            SELECT 
                s.name AS especialidad,
                COUNT(DISTINCT ps.provider_id) AS proveedores_count,
                string_agg(DISTINCT p.name, ', ') AS proveedores,
                MIN(s.duration_min) AS duracion_min,
                MIN(s.buffer_min) AS buffer_min
            FROM public.services s
            JOIN public.provider_services ps ON s.id = ps.service_id
            JOIN public.providers p ON ps.provider_id = p.id
            WHERE p.is_active = TRUE
            GROUP BY s.name
            ORDER BY s.name;
        `;

        const specialtyResult = await pool.query(specialtyQuery);

        if (specialtyResult.rows.length === 0) {
            console.log('⚠️  NO hay datos en provider_services');
            console.log('');
            console.log('💡 Ejecutar seed:');
            console.log('   npx tsx scripts-ts/seed_multi_provider.ts');
            return;
        }

        console.log('');
        console.log('Especialidad          | Prov | Duración | Buffer | Proveedores');
        console.log('──────────────────────┼──────┼──────────┼────────┼──────────────────────────────────────');

        for (const row of specialtyResult.rows) {
            const countStr = row.proveedores_count.toString().padEnd(4);
            const durationStr = (row.duracion_min || 'N/A').toString().padEnd(8);
            const bufferStr = (row.buffer_min || 'N/A').toString().padEnd(6);
            console.log(
                `${row.especialidad.padEnd(21)} | ${countStr} | ${durationStr} | ${bufferStr} | ${row.proveedores}`
            );
        }

        console.log('');

        // 2. Verificar horarios
        console.log('📅 HORARIOS POR PROVEEDOR');
        console.log('═══════════════════════════════════════════════════════════');

        const scheduleQuery = `
            SELECT 
                p.name AS proveedor,
                s.name AS especialidad,
                COUNT(psch.id) AS horarios_count,
                string_agg(
                    CASE psch.day_of_week
                        WHEN 0 THEN 'Dom'
                        WHEN 1 THEN 'Lun'
                        WHEN 2 THEN 'Mar'
                        WHEN 3 THEN 'Mié'
                        WHEN 4 THEN 'Jue'
                        WHEN 5 THEN 'Vie'
                        WHEN 6 THEN 'Sáb'
                    END || ' ' || psch.start_time || '-' || psch.end_time,
                    ', '
                    ORDER BY psch.day_of_week, psch.start_time
                ) AS horarios
            FROM public.providers p
            JOIN public.provider_services ps ON p.id = ps.provider_id
            JOIN public.services s ON ps.service_id = s.id
            LEFT JOIN public.provider_schedules psch ON p.id = psch.provider_id
            WHERE p.is_active = TRUE
            GROUP BY p.name, s.name
            ORDER BY s.name, p.name;
        `;

        const scheduleResult = await pool.query(scheduleQuery);

        for (const row of scheduleResult.rows) {
            console.log('');
            console.log(`👤 ${row.proveedor} (${row.especialidad})`);
            console.log(`   Horarios: ${row.horarios_count}`);
            if (row.horarios) {
                console.log(`   ${row.horarios}`);
            }
        }

        console.log('');

        // 3. Estadísticas generales
        console.log('📈 ESTADÍSTICAS GENERALES');
        console.log('═══════════════════════════════════════════════════════════');

        const statsQuery = `
            SELECT 
                (SELECT COUNT(*) FROM public.providers WHERE is_active = TRUE) AS total_providers,
                (SELECT COUNT(*) FROM public.services) AS total_services,
                (SELECT COUNT(*) FROM public.provider_services) AS total_links,
                (SELECT COUNT(*) FROM public.provider_schedules) AS total_schedules,
                (SELECT COUNT(*) FROM public.bookings WHERE status = 'CONFIRMED') AS confirmed_bookings;
        `;

        const statsResult = await pool.query(statsQuery);
        const stats = statsResult.rows[0];

        console.log('');
        console.log(`  Total Proveedores Activos:  ${stats.total_providers}`);
        console.log(`  Total Servicios:            ${stats.total_services}`);
        console.log(`  Total Vínculos (P-S):       ${stats.total_links}`);
        console.log(`  Total Horarios:             ${stats.total_schedules}`);
        console.log(`  Reservas Confirmadas:       ${stats.confirmed_bookings}`);
        console.log('');

        // 4. Validación
        console.log('✅ VALIDACIÓN');
        console.log('═══════════════════════════════════════════════════════════');

        const issues = [];

        // Verificar que cada especialidad tenga ≥2 proveedores
        const multiProviderCheck = specialtyResult.rows.filter(r => parseInt(r.proveedores_count) < 2);
        if (multiProviderCheck.length > 0) {
            issues.push(
                `⚠️  ${multiProviderCheck.length} especialidad(es) con <2 proveedores: ` +
                multiProviderCheck.map(r => r.especialidad).join(', ')
            );
        } else {
            console.log('✅ Todas las especialidades tienen ≥2 proveedores');
        }

        // Verificar que cada proveedor tenga horarios
        const noScheduleCheck = scheduleResult.rows.filter(r => parseInt(r.horarios_count) === 0);
        if (noScheduleCheck.length > 0) {
            issues.push(
                `⚠️  ${noScheduleCheck.length} proveedor(es) sin horarios: ` +
                noScheduleCheck.map(r => r.proveedor).join(', ')
            );
        } else {
            console.log('✅ Todos los proveedores tienen horarios');
        }

        // Verificar que no haya proveedores duplicados
        const duplicateCheck = `
            SELECT name, COUNT(*) AS count
            FROM public.providers
            GROUP BY name
            HAVING COUNT(*) > 1;
        `;
        const duplicateResult = await pool.query(duplicateCheck);
        if (duplicateResult.rows.length > 0) {
            issues.push(
                `⚠️  ${duplicateResult.rows.length} proveedor(es) duplicados: ` +
                duplicateResult.rows.map(r => r.name).join(', ')
            );
        } else {
            console.log('✅ No hay proveedores duplicados');
        }

        console.log('');

        if (issues.length > 0) {
            console.log('═══════════════════════════════════════════════════════════');
            console.log('⚠️  PROBLEMAS DETECTADOS:');
            issues.forEach(issue => console.log(`   ${issue}`));
            console.log('');
            console.log('💡 Para re-ejecutar el seed:');
            console.log('   npx tsx scripts-ts/seed_multi_provider.ts');
        } else {
            console.log('✅ SEED VERIFICADO CORRECTAMENTE');
            console.log('');
            console.log('🎯 El sistema está listo para:');
            console.log('   • Mostrar múltiples proveedores por especialidad');
            console.log('   • Preguntar preferencia al usuario');
            console.log('   • Buscar disponibilidad por proveedor');
        }

    } catch (error) {
        console.error('❌ ERROR:', (error as Error).message);
        throw error;
    } finally {
        await pool.end();
    }
}

verifySeed()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal:', err.message);
        process.exit(1);
    });
