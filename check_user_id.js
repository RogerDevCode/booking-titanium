const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query('SELECT id, user_id, customer_id, idempotency_key FROM bookings ORDER BY created_at DESC LIMIT 1');
    console.log(JSON.stringify(res.rows[0], null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
check();
