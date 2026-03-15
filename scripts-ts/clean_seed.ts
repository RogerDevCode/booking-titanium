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

async function run() {
  const client = await pool.connect();
  try {
    // Clean seed bookings (user_id >= 9600000 for new seed, 9300000 for old seed)
    const r1 = await client.query(`DELETE FROM bookings WHERE user_id >= 9300000 AND user_id < 9900000`);
    const r2 = await client.query(`DELETE FROM users WHERE chat_id >= 9300000 AND chat_id < 9900000`);
    console.log(`Deleted ${r1.rowCount} bookings and ${r2.rowCount} users.`);
  } finally {
    client.release();
    pool.end();
  }
}
run().catch(console.error);
