const { Client } = require('pg');
require('dotenv').config({ path: 'scripts-ts/.env' });

async function debug() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        await client.connect();
        const query = "SELECT * FROM provider_schedules WHERE provider_id = 1 AND day_of_week = 1";
        const res = await client.query(query);
        console.log('Schedules:', res.rows);
        
        const query2 = "SELECT * FROM services WHERE id = 1";
        const res2 = await client.query(query2);
        console.log('Services:', res2.rows);
    } catch (err) {
        console.error('ERROR:', err.message);
    } finally {
        await client.end();
    }
}
debug();
