import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig: any = {
    host: process.env.REMOTE_NEON_DB_HOST || process.env.DB_POSTGRESDB_HOST || 'localhost',
    port: parseInt(process.env.REMOTE_NEON_DB_PORT || process.env.DB_POSTGRESDB_PORT || '5432'),
    database: process.env.REMOTE_NEON_DB_DATABASE || process.env.DB_POSTGRESDB_DATABASE || 'n8n_subscribers',
    user: process.env.REMOTE_NEON_DB_USER || process.env.DB_POSTGRESDB_USER || 'n8n_user',
    password: process.env.REMOTE_NEON_DB_PASSWORD || process.env.DB_POSTGRESDB_PASSWORD || 'password',
};

// Use SSL if connecting to Neon
if (dbConfig.host.includes('neon.tech')) {
    dbConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(dbConfig);

async function clean() {
    try {
        const res = await pool.query("DELETE FROM public.bookings WHERE user_id >= 9100000;");
        console.log(`Successfully deleted ${res.rowCount} seed bookings.`);
    } catch (e) {
        console.error('Error deleting seed bookings:', e);
    } finally {
        await pool.end();
    }
}

clean();
