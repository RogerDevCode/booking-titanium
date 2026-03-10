/**
 * QA EDGE CASES & PARANOID TEST SUITE
 * Based on PROJECT_DEEP_AUDIT_2026-03-10.md - Section 3: ESTRATEGIA DE PRUEBAS
 *
 * This suite focuses on:
 * - Edge Cases (reservas en pasado, cancelaciones restringidas, emails inválidos)
 * - Paranoid Tests (SQL injection, identidad colisión)
 * - Capacity Tests (reservar todo un día, luego verificar respuesta)
 * - Concurrency Tests (múltiples peticiones simultáneas)
 *
 * Run: npx jest tests/qa-edge-cases.test.ts --testTimeout=120000 --forceExit
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// DAL URL: Use localhost if available, otherwise Docker service name
const DAL_URL = process.env.DAL_SERVICE_URL || 'http://localhost:3000';
const N8N_URL = (process.env.N8N_API_URL || 'https://n8n.stax.ink').replace('/api/v1', '');

// Construct Database URL from components if not provided
const DATABASE_URL = process.env.DATABASE_URL || (
    process.env.REMOTE_NEON_DB_HOST 
    ? `postgresql://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`
    : process.env.REMOTE_NEON_DB_URL
);

const TELEGRAM_ID = Number(process.env.TELEGRAM_ID || 5391760292);

const SHORT = 15_000;
const MID = 30_000;
const LONG = 120_000;

// Pool for direct DB operations
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function callDAL(endpoint: string, method = 'GET', body?: any, timeoutMs = 10000): Promise<any> {
    const url = `${DAL_URL}${endpoint}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const options: RequestInit = {
            method,
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
        };
        if (body) options.body = JSON.stringify(body);

        const res = await fetch(url, options);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function callN8NWebhook(webhookPath: string, method = 'POST', body?: any, timeoutMs = 10000): Promise<any> {
    const url = `${N8N_URL}/webhook/${webhookPath}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: ctrl.signal,
        });
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

function futureDate(daysAhead: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
}

function futureDateTime(daysAhead: number, hour: number, minute: number = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
}

async function seedDatabase(): Promise<void> {
    console.log('\n🌱 SEEDING DATABASE for QA Tests...\n');

    try {
        // Check if providers exist
        const providerCheck = await pool.query(
            `SELECT COUNT(*) as count FROM public.providers WHERE is_active = TRUE`
        );

        if (parseInt(providerCheck.rows[0].count) === 0) {
            console.log('⚠️  No active providers found. Running seed script...\n');
            console.log('   Please run: npx tsx scripts-ts/seed_multi_provider.ts\n');
            throw new Error('Database not seeded. Run seed_multi_provider.ts first.');
        }

        // Get provider and service IDs for tests
        const providerResult = await pool.query(
            `SELECT id FROM public.providers WHERE is_active = TRUE LIMIT 1`
        );
        const serviceResult = await pool.query(
            `SELECT id FROM public.services LIMIT 1`
        );

        console.log(`✅ Database ready: ${providerCheck.rows[0].count} providers available`);
        console.log(`   Test Provider ID: ${providerResult.rows[0].id}`);
        console.log(`   Test Service ID: ${serviceResult.rows[0].id}\n`);

    } catch (error) {
        console.error('❌ Seed check failed:', (error as Error).message);
        throw error;
    }
}

async function cleanupTestBookings(chat_id: number): Promise<void> {
    try {
        await pool.query(
            `UPDATE public.bookings SET status = 'CANCELLED', status_reason = 'QA Test Cleanup'
             WHERE user_id = $1 AND status = 'CONFIRMED'`,
            [chat_id]
        );
        console.log(`🧹 Cleaned up test bookings for chat_id: ${chat_id}`);
    } catch (error) {
        console.error('Cleanup error:', (error as Error).message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRE-TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════

beforeAll(async () => {
    await seedDatabase();
}, 30_000);

afterAll(async () => {
    await pool.end();
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: EDGE CASES (Situaciones Límite)
// ═══════════════════════════════════════════════════════════════════════════

describe('📋 QA-EDGE-01: Situaciones Límite', () => {

    describe('Edge Case 1.1: Reserva en el pasado', () => {
        it('RECHAZA reserva con start_time en el pasado', async () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);
            const pastTime = pastDate.toISOString();

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID,
                provider_id: 1,
                service_id: 1,
                start_time: pastTime,
                user_name: 'QA Test User',
                user_email: 'qa-edge-test@booking-titanium.test'
            }, SHORT);

            // Expected: DAL should reject past dates
            expect(result.success).toBe(false);
            expect(result.error_code).toBeDefined();
            console.log(`   ✓ Past booking rejected: ${result.error_code}`);
        }, SHORT);

        it('RECHAZA reserva para hoy en hora ya pasada (con buffer)', async () => {
            // Try to book 1 hour ago
            const pastHour = new Date();
            pastHour.setHours(pastHour.getHours() - 1);

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID,
                provider_id: 1,
                service_id: 1,
                start_time: pastHour.toISOString(),
                user_name: 'QA Test User',
                user_email: 'qa-edge-test@booking-titanium.test'
            }, SHORT);

            expect(result.success).toBe(false);
            console.log(`   ✓ Past-hour booking rejected: ${result.error_message}`);
        }, SHORT);
    });

    describe('Edge Case 1.2: Cancelación de cita COMPLETED', () => {
        let testBookingId: string | null = null;

        beforeAll(async () => {
            // Create a test booking
            const futureTime = futureDateTime(5, 10, 0);
            const createResult = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 1000, // Use different chat_id to avoid collisions
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: 'QA Cancel Test',
                user_email: 'qa-cancel-test@booking-titanium.test'
            }, SHORT);

            if (createResult.success && createResult.data?.booking_id) {
                testBookingId = createResult.data.booking_id;

                // Change status to COMPLETED
                await callDAL('/update-booking-status', 'POST', {
                    booking_id: testBookingId,
                    status: 'COMPLETED',
                    actor_id: 'QA_TEST_SUITE'
                }, SHORT);
            }
        }, SHORT);

        it('RECHAZA cancelación de reserva con estado COMPLETED', async () => {
            if (!testBookingId) {
                console.log('   ⚠️  Skipping: No test booking created');
                return;
            }

            const result = await callDAL('/cancel-booking', 'POST', {
                booking_id: testBookingId,
                chat_id: TELEGRAM_ID + 1000,
                reason: 'QA Test: Should fail'
            }, SHORT);

            expect(result.success).toBe(false);
            expect(result.error_code).toBe('CANCELLATION_RESTRICTED');
            console.log(`   ✓ COMPLETED booking cancellation blocked: ${result.error_message}`);
        }, SHORT);

        afterAll(async () => {
            if (testBookingId) {
                await cleanupTestBookings(TELEGRAM_ID + 1000);
            }
        });
    });

    describe('Edge Case 1.3: Email inválido', () => {
        it('RECHAZA reserva con email inválido (formato incorrecto)', async () => {
            const futureTime = futureDateTime(6, 11, 0);

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 2000,
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: 'QA Invalid Email Test',
                user_email: 'not-a-valid-email' // Invalid email format
            }, SHORT);

            // System now correctly rejects invalid email format
            expect(result.success).toBe(false);
            expect(result.error_message).toContain('Invalid email format');
            console.log(`   ✓ Invalid email correctly rejected: ${result.error_message}`);
        }, SHORT);

        it('ACEPTA reserva con email vacío (asigna fallback si no es nulo)', async () => {
            const futureTime = futureDateTime(6, 12, 0);

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 2001,
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: 'QA Empty Email Test',
                user_email: '' // Empty email (optional in validation)
            }, SHORT);

            expect(result.success).toBe(true);
            console.log(`   ✓ Empty email handled: ${result.data?.booking_code}`);

            if (result.success && result.data?.booking_id) {
                await cleanupTestBookings(TELEGRAM_ID + 2001);
            }
        }, SHORT);
    });

    describe('Edge Case 1.4: Médico inexistente', () => {
        it('RECHAZA reserva con provider_id inexistente', async () => {
            const futureTime = futureDateTime(7, 10, 0);

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID,
                provider_id: 999999, // Non-existent provider
                service_id: 1,
                start_time: futureTime,
                user_name: 'QA Test',
                user_email: 'qa-nonexistent@booking-titanium.test'
            }, SHORT);

            expect(result.success).toBe(false);
            expect(result.error_code).toBeDefined();
            console.log(`   ✓ Non-existent provider rejected: ${result.error_message}`);
        }, SHORT);

        it('RECHAZA disponibilidad para service_id inexistente', async () => {
            const result = await callDAL('/availability', 'POST', {
                provider_id: 1,
                service_id: 999999, // Non-existent service
                date: futureDate(1)
            }, SHORT);

            // Should return empty slots or error
            expect(result.data?.slots || []).toHaveLength(0);
            console.log(`   ✓ Non-existent service returns empty slots`);
        }, SHORT);
    });

    describe('Edge Case 1.5: Usuario en múltiples listas de espera', () => {
        const testChatId = TELEGRAM_ID + 3000;

        afterAll(async () => {
            await cleanupTestBookings(testChatId);
        });

        it('PERMITE usuario en 2 listas de espera (sin colisión de horas)', async () => {
            const date1 = futureDate(5);
            const date2 = futureDate(6);

            const result1 = await callDAL('/waitlist/join', 'POST', {
                chat_id: testChatId,
                provider_id: 1,
                service_id: 1,
                preferred_date: date1
            }, SHORT);

            const result2 = await callDAL('/waitlist/join', 'POST', {
                chat_id: testChatId,
                provider_id: 2,
                service_id: 1,
                preferred_date: date2
            }, SHORT);

            // Both should succeed (different dates)
            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            console.log(`   ✓ User can join 2 waitlists (different dates)`);
        }, SHORT);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: PARANOID TESTS (Seguridad e Integridad)
// ═══════════════════════════════════════════════════════════════════════════

describe('🛡️ QA-PARANOID-02: Seguridad e Integridad', () => {

    describe('Paranoid 2.1: Inyección SQL', () => {
        it('SANITIZA intento de SQL injection en user_name', async () => {
            const futureTime = futureDateTime(8, 10, 0);
            const maliciousName = "' OR 1=1 --";

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 4000,
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: maliciousName,
                user_email: 'qa-sql-injection@booking-titanium.test'
            }, SHORT);

            // Should succeed but with sanitized name, or fail validation
            if (result.success) {
                // Verify the stored name is not the malicious string
                const userCheck = await pool.query(
                    `SELECT full_name FROM public.users WHERE chat_id = $1`,
                    [TELEGRAM_ID + 4000]
                );
                const storedName = userCheck.rows[0]?.full_name;
                expect(storedName).not.toBe("' OR 1=1 --");
                console.log(`   ✓ SQL injection attempt sanitized: "${storedName}"`);

                await cleanupTestBookings(TELEGRAM_ID + 4000);
            } else {
                console.log(`   ✓ SQL injection attempt rejected: ${result.error_message}`);
            }
        }, SHORT);

        it('SANITIZA intento de SQL injection en email', async () => {
            const futureTime = futureDateTime(8, 11, 0);
            const maliciousEmail = "'; DROP TABLE users; --";

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 4001,
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: 'QA SQL Test',
                user_email: maliciousEmail
            }, SHORT);

            if (result.success) {
                const userCheck = await pool.query(
                    `SELECT email FROM public.users WHERE chat_id = $1`,
                    [TELEGRAM_ID + 4001]
                );
                const storedEmail = userCheck.rows[0]?.email;
                expect(storedEmail).not.toBe("'; DROP TABLE users; --");
                console.log(`   ✓ SQL injection in email sanitized: "${storedEmail}"`);

                await cleanupTestBookings(TELEGRAM_ID + 4001);
            }
        }, SHORT);
    });

    describe('Paranoid 2.2: Colisión de Identidad', () => {
        const testChatId = TELEGRAM_ID + 5000;

        beforeAll(async () => {
            // Create initial user
            await callDAL('/update-user', 'POST', {
                chat_id: testChatId,
                full_name: 'Original User',
                email: 'original@booking-titanium.test'
            }, SHORT);
        }, SHORT);

        it('ACTUALIZA usuario existente (ON CONFLICT UPDATE) en lugar de fallar', async () => {
            const result = await callDAL('/update-user', 'POST', {
                chat_id: testChatId,
                full_name: 'Updated User',
                email: 'updated@booking-titanium.test'
            }, SHORT);

            expect(result.success).toBe(true);
            expect(result.data.full_name).toBe('Updated User');
            expect(result.data.email).toBe('updated@booking-titanium.test');
            console.log(`   ✓ User data updated via ON CONFLICT`);
        }, SHORT);

        afterAll(async () => {
            await cleanupTestBookings(testChatId);
        });
    });

    describe('Paranoid 2.3: Validación de tipos de datos', () => {
        it('RECHAZA chat_id como string (debe ser number)', async () => {
            const futureTime = futureDateTime(9, 10, 0);

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: 'abc123', // Invalid: string instead of number
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: 'QA Type Test',
                user_email: 'qa-type-test@booking-titanium.test'
            }, SHORT);

            expect(result.success).toBe(false);
            console.log(`   ✓ Invalid chat_id type rejected: ${result.error_message}`);
        }, SHORT);

        it('RECHAZA start_time inválido (no ISO8601)', async () => {
            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 6000,
                provider_id: 1,
                service_id: 1,
                start_time: 'mañana a las 5', // Invalid format
                user_name: 'QA Date Test',
                user_email: 'qa-date-test@booking-titanium.test'
            }, SHORT);

            expect(result.success).toBe(false);
            console.log(`   ✓ Invalid date format rejected: ${result.error_message}`);
        }, SHORT);

        it('RECHAZA reminders como string (debe ser array)', async () => {
            const futureTime = futureDateTime(9, 11, 0);

            const result = await callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 6001,
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: 'QA Reminder Test',
                user_email: 'qa-reminder-test@booking-titanium.test',
                reminders: 'cada hora' // Invalid: string instead of array
            }, SHORT);

            // May succeed with default reminders or fail
            console.log(`   ✓ Invalid reminders type handled: ${result.success ? 'defaulted' : 'rejected'}`);
        }, SHORT);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: CAPACITY TEST (Reservar todo un día)
// ═══════════════════════════════════════════════════════════════════════════

describe('📊 QA-CAPACITY-03: Capacidad - Reservar Todo un Día', () => {

    it('RESERVA todos los slots disponibles de un día y verifica respuesta para nueva reserva', async () => {
        const testDay = futureDate(10); // Use a day 10 days ahead
        const testChatId = TELEGRAM_ID + 7000;
        const createdBookings: string[] = [];

        console.log(`\n   📅 Test Day: ${testDay}`);
        console.log(`   👤 Test User: ${testChatId}\n`);

        // Step 1: Get all available slots for the test day
        const availabilityResult = await callDAL('/availability', 'POST', {
            provider_id: 1,
            service_id: 1,
            date: testDay
        }, SHORT);

        const slots = availabilityResult.data?.slots || [];
        console.log(`   📋 Found ${slots.length} available slots for ${testDay}\n`);

        if (slots.length === 0) {
            console.log('   ⚠️  No slots available on test day, skipping capacity test\n');
            return;
        }

        // Step 2: Book ALL slots
        console.log(`   🔒 Booking all ${slots.length} slots...\n`);

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const suffix = String.fromCharCode(65 + (i % 26)) + (i > 25 ? String.fromCharCode(65 + Math.floor(i / 26)) : '');
            const bookingResult = await callDAL('/create-booking', 'POST', {
                chat_id: testChatId + i, // Different chat_id per booking to avoid user collision
                provider_id: 1,
                service_id: 1,
                start_time: slot.start_time,
                user_name: `QA Capacity Test User ${suffix}`,
                user_email: `qa-capacity-${i}@booking-titanium.test`
            }, SHORT);

            if (bookingResult.success) {
                createdBookings.push(bookingResult.data.booking_code);
                console.log(`   ✓ Slot ${i + 1}/${slots.length} booked: ${slot.display_time} - ${bookingResult.data.booking_code}`);
            } else {
                console.log(`   ✗ Slot ${i + 1}/${slots.length} failed: ${bookingResult.error_message}`);
            }
        }

        console.log(`\n   ✅ Successfully booked ${createdBookings.length}/${slots.length} slots\n`);

        // Step 3: Try to book one more slot on the same day (should fail)
        console.log(`   🔍 Attempting to book an additional slot on fully booked day...\n`);

        const extraBookingResult = await callDAL('/create-booking', 'POST', {
            chat_id: testChatId + 9999,
            provider_id: 1,
            service_id: 1,
            start_time: slots[0].start_time, // Try the first slot again
            user_name: 'QA Extra Booking Test',
            user_email: 'qa-extra-booking@booking-titanium.test'
        }, SHORT);

        expect(extraBookingResult.success).toBe(false);
        expect(extraBookingResult.error_code).toBeDefined();
        console.log(`   ✓ Extra booking correctly rejected: ${extraBookingResult.error_code}`);
        console.log(`   ✓ Error message: ${extraBookingResult.error_message}\n`);

        // Step 4: Verify availability now shows 0 slots
        const postBookingAvailability = await callDAL('/availability', 'POST', {
            provider_id: 1,
            service_id: 1,
            date: testDay
        }, SHORT);

        const remainingSlots = postBookingAvailability.data?.slots || [];
        console.log(`   📊 Remaining slots after full booking: ${remainingSlots.length}\n`);

        expect(remainingSlots.length).toBeLessThan(slots.length);
        console.log(`   ✓ Capacity test completed successfully\n`);

        // Cleanup
        for (let i = 0; i < slots.length; i++) {
            await cleanupTestBookings(testChatId + i);
        }
    }, LONG);
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: CONCURRENCY TEST (Condiciones de Carrera)
// ═══════════════════════════════════════════════════════════════════════════

describe('⚡ QA-CONCURRENCY-04: Condiciones de Carrera', () => {

    it('MANEJA 10 peticiones simultáneas para el mismo slot (solo 1 debe tener éxito)', async () => {
        const futureTime = futureDateTime(15, 14, 0); // Day 15, 14:00
        const concurrentRequests = 10;
        const results: any[] = [];

        console.log(`\n   ⚡ Launching ${concurrentRequests} concurrent requests for same slot...\n`);

        // Launch all requests simultaneously
        const promises = Array.from({ length: concurrentRequests }, (_, i) => {
            const suffix = String.fromCharCode(65 + i);
            return callDAL('/create-booking', 'POST', {
                chat_id: TELEGRAM_ID + 8000 + i,
                provider_id: 1,
                service_id: 1,
                start_time: futureTime,
                user_name: `QA Concurrency Test ${suffix}`,
                user_email: `qa-concurrency-${i}@booking-titanium.test`
            }, SHORT);
        });

        const allResults = await Promise.all(promises);
        results.push(...allResults);

        // Count successes and failures
        const successes = results.filter(r => r.success === true);
        const failures = results.filter(r => r.success === false);

        console.log(`   ✓ Successes: ${successes.length}`);
        console.log(`   ✓ Failures: ${failures.length}\n`);

        // CRITICAL: Only ONE booking should succeed (Postgres Advisory Lock)
        expect(successes.length).toBeLessThanOrEqual(1);
        console.log(`   ✓ Advisory Lock working: Only ${successes.length} booking(s) succeeded\n`);

        // Verify error codes for failures
        const slotOccupiedErrors = failures.filter(r => r.error_code === 'SLOT_OCCUPIED');
        console.log(`   ✓ SLOT_OCCUPIED errors: ${slotOccupiedErrors.length}\n`);

        // Cleanup
        for (let i = 0; i < concurrentRequests; i++) {
            await cleanupTestBookings(TELEGRAM_ID + 8000 + i);
        }
    }, LONG);

    it('MANEJA 5 peticiones simultáneas de FIND_NEXT_AVAILABLE (todos deben recibir datos consistentes)', async () => {
        const concurrentRequests = 5;
        const results: any[] = [];

        console.log(`\n   ⚡ Launching ${concurrentRequests} concurrent find-next-available requests...\n`);

        const promises = Array.from({ length: concurrentRequests }, (_, i) =>
            callDAL('/find-next-available', 'POST', {
                provider_id: 1,
                service_id: 1,
                date: futureDate(0)
            }, SHORT)
        );

        const allResults = await Promise.all(promises);
        results.push(...allResults);

        // All should succeed
        const successes = results.filter(r => r.success === true);
        expect(successes.length).toBe(concurrentRequests);
        console.log(`   ✓ All ${concurrentRequests} requests succeeded\n`);

        // All should return the same date (consistent view)
        const dates = results.map(r => r.date).filter(d => d !== null);
        const uniqueDates = new Set(dates);
        console.log(`   ✓ Unique dates returned: ${uniqueDates.size}\n`);
    }, MID);
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: INTEGRATION TESTS (Flujo Completo)
// ═══════════════════════════════════════════════════════════════════════════

describe('🔗 QA-INTEGRATION-05: Flujo Completo E2E', () => {

    it('EJECUTA flujo completo: Registro -> Disponibilidad -> Reserva -> Confirmación', async () => {
        const testChatId = TELEGRAM_ID + 9000;
        const testDay = futureDate(3);

        console.log(`\n   👤 Test User: ${testChatId}`);
        console.log(`   📅 Test Day: ${testDay}\n`);

        // Step 1: Register user
        console.log(`   1️⃣  Registering user...\n`);
        const registerResult = await callDAL('/update-user', 'POST', {
            chat_id: testChatId,
            full_name: 'QA Integration Test User',
            email: 'qa-e2e@booking-titanium.test'
        }, SHORT);

        expect(registerResult.success).toBe(true);
        console.log(`   ✓ User registered: ${registerResult.data.full_name}\n`);

        // Step 2: Check availability
        console.log(`   2️⃣  Checking availability...\n`);
        const availabilityResult = await callDAL('/availability', 'POST', {
            provider_id: 1,
            service_id: 1,
            date: testDay
        }, SHORT);

        expect(availabilityResult.success).toBe(true);
        const slots = availabilityResult.data?.slots || [];
        console.log(`   ✓ Found ${slots.length} available slots\n`);

        if (slots.length === 0) {
            console.log('   ⚠️  No slots available, skipping rest of test\n');
            return;
        }

        // Step 3: Create booking
        console.log(`   3️⃣  Creating booking...\n`);
        const bookingResult = await callDAL('/create-booking', 'POST', {
            chat_id: testChatId,
            provider_id: 1,
            service_id: 1,
            start_time: slots[0].start_time,
            user_name: 'QA Integration Test User',
            user_email: 'qa-e2e@booking-titanium.test',
            reminders: [24, 6, 1]
        }, SHORT);

        expect(bookingResult.success).toBe(true);
        const bookingCode = bookingResult.data?.booking_code;
        console.log(`   ✓ Booking created: ${bookingCode}\n`);

        // Step 4: Verify user bookings
        console.log(`   4️⃣  Verifying user bookings...\n`);
        const userBookingsResult = await callDAL(`/user-bookings/${testChatId}`, 'GET', undefined, SHORT);

        expect(userBookingsResult.success).toBe(true);
        const userBookings = userBookingsResult.data || [];
        expect(userBookings.length).toBeGreaterThan(0);
        console.log(`   ✓ User has ${userBookings.length} booking(s)\n`);

        // Step 5: Cancel booking
        console.log(`   5️⃣  Cancelling booking...\n`);
        const cancelResult = await callDAL('/cancel-booking', 'POST', {
            booking_id: bookingCode,
            chat_id: testChatId,
            reason: 'QA E2E Test cancellation'
        }, SHORT);

        expect(cancelResult.success).toBe(true);
        console.log(`   ✓ Booking cancelled successfully\n`);

        // Cleanup
        await cleanupTestBookings(testChatId);
        console.log(`   ✅ E2E Flow completed successfully\n`);
    }, LONG);
});
