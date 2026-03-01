const { Client } = require('pg');
require('dotenv').config({ path: 'scripts-ts/.env' });

async function setup() {
    const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();
        await client.query("UPDATE provider_schedules SET start_time = '00:00:00', end_time = '23:59:59' WHERE provider_id = 1;");
        console.log('✅ Horario actualizado a 24/7 para tests');
    } catch (err) { console.error(err.message); } finally { await client.end(); }
}
setup();
