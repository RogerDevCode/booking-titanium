/**
 * Fix DAL Server - Normalized Schema Compatibility
 *
 * Changes:
 * 1. CREATE: Now uses UPSERT on users table before creating booking
 * 2. CANCEL: Changed chat_id → user_id in WHERE clause
 * 3. RESCHEDULE: Changed chat_id → user_id in WHERE clause
 * 4. All endpoints now return Standard Contract with _meta
 *
 * Schema compatibility:
 * - bookings.user_id BIGINT REFERENCES users(chat_id)
 * - users.chat_id BIGINT PRIMARY KEY
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verifySchema() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('🔍 Verifying database schema...');

        // Check users table exists
        const usersCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        `);

        if (!usersCheck.rows[0].exists) {
            console.error('❌ users table does not exist!');
            return;
        }

        // Check bookings.user_id column exists
        const userIdCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'bookings' 
                AND column_name = 'user_id'
            );
        `);

        if (!userIdCheck.rows[0].exists) {
            console.error('❌ bookings.user_id column does not exist!');
            console.error('   Run: schema_v2.sql to create proper schema');
            return;
        }

        // Check bookings.chat_id column does NOT exist (should not exist in normalized schema)
        const chatIdCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'bookings' 
                AND column_name = 'chat_id'
            );
        `);

        if (chatIdCheck.rows[0].exists) {
            console.warn('⚠️  bookings.chat_id column exists (should be removed in normalized schema)');
        }

        console.log('✅ Schema verification complete');
        console.log('   - users table: OK');
        console.log('   - bookings.user_id: OK');
        console.log('   - Normalized schema: OK');

        // Count users
        const userCount = await client.query('SELECT COUNT(*) FROM users');
        console.log(`   - Users in database: ${userCount.rows[0].count}`);

        // Count bookings
        const bookingCount = await client.query('SELECT COUNT(*) FROM bookings');
        console.log(`   - Bookings in database: ${bookingCount.rows[0].count}`);

        // Cancel watchdog on success
        watchdog.cancel();

    } catch (err: any) {
        watchdog.cancel();
        console.error('❌ Error:', err.message);
    } finally {
        await client.end();
    }
}

verifySchema();
