const { Pool } = require('pg');
require('dotenv').config();

async function fix() {
  const connectionString = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  
  try {
    console.log('Updating function with correct column names...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION booking_dlq_add(p_payload JSONB)
      RETURNS TABLE(dlq_id BIGINT) AS $$
      DECLARE
          v_dlq_id BIGINT;
      BEGIN
          INSERT INTO booking_dlq (
              booking_id, provider_id, service_id, failure_reason, last_error_message, 
              last_error_stack, original_payload, idempotency_key, status, failure_count
          )
          VALUES (
              (p_payload->>'booking_id')::BIGINT,
              (p_payload->>'provider_id')::BIGINT,
              (p_payload->>'service_id')::BIGINT,
              (p_payload->>'failure_reason')::TEXT,
              (p_payload->>'error_message')::TEXT,
              (p_payload->>'error_stack')::TEXT,
              (p_payload->'original_payload')::JSONB,
              (p_payload->>'idempotency_key')::TEXT,
              'pending',
              0
          )
          ON CONFLICT (idempotency_key) DO UPDATE SET
              failure_count = booking_dlq.failure_count + 1,
              updated_at = NOW()
          RETURNING dlq_id INTO v_dlq_id;

          RETURN QUERY SELECT v_dlq_id;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ DB Function updated.');
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    await pool.end();
  }
}
fix();
