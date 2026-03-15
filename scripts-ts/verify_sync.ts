require('dotenv').config();
const { Pool } = require('pg');
const dbUser = process.env.REMOTE_NEON_DB_USER;
const dbPass = process.env.REMOTE_NEON_DB_PASSWORD;
const dbHost = process.env.REMOTE_NEON_DB_HOST;
const dbPort = process.env.REMOTE_NEON_DB_PORT;
const dbName = process.env.REMOTE_NEON_DB_DATABASE;
const url = `postgres://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}`;

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, user_id, start_time::text, gcal_event_id FROM bookings WHERE user_id >= 9300000 ORDER BY start_time ASC`);
    console.log('--- Current Bookings ---');
    console.table(res.rows);
    const missing = res.rows.filter(r => !r.gcal_event_id).length;
    console.log(`Total bookings: ${res.rows.length}, Missing gcal_event_id: ${missing}`);
  } finally {
    client.release();
    pool.end();
  }
}
run().catch(console.error);
