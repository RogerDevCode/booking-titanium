const { Pool } = require('pg');
require('dotenv').config();

async function test() {
  const connectionString = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const jsonTest = JSON.stringify({ message: "Test with , comma", val: 1 });
    const b64 = Buffer.from(jsonTest).toString('base64');
    
    // We use 'base64' in Postgres decode function
    const query = "SELECT convert_from(decode($1, 'base64'), 'utf-8')::jsonb as data";
    const res = await pool.query(query, [b64]);
    console.log('Decoded:', res.rows[0].data);
    
    if (res.rows[0].data.message.includes(',')) {
      console.log('✅ VALIDATION PASSED: Base64 bypasses comma issues and preserves data integrity.');
    }
  } catch (e) {
    console.error('❌ VALIDATION FAILED:', e.message);
  } finally {
    await pool.end();
  }
}
test();
