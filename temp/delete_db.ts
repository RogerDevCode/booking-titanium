import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || `postgres://${process.env.DB_POSTGRES_USER}:${process.env.DB_POSTGRES_PASSWORD}@localhost:5432/${process.env.DB_POSTGRES_DATABASE}`,
});

async function run() {
  const result = await pool.query("DELETE FROM bookings WHERE start_time >= '2026-04-01' AND start_time < '2026-04-02'");
  console.log(`Deleted ${result.rowCount} rows from DB`);
  process.exit(0);
}
run().catch(err => { console.error(err); process.exit(1); });