import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.stax.ink/webhook';

const dbUrl = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

jest.setTimeout(30000);

describe('Rollback Workflow TDD', () => {
  let testBookingId: number;
  const testLockKey = 'lock_rollback_test_' + Date.now();
  const testOwnerToken = 'token_' + Date.now();

  beforeAll(async () => {
    // 1. Create a dummy booking
    const bRes = await pool.query(
      "INSERT INTO bookings (provider_id, service_id, start_time, end_time, status, user_id) VALUES (1, 1, NOW(), NOW() + INTERVAL '1 hour', 'CONFIRMED', 123456789) RETURNING id"
    );
    testBookingId = bRes.rows[0].id;

    // 2. Create a dummy lock
    await pool.query(
      "INSERT INTO booking_locks (provider_id, start_time, lock_key, owner_token, expires_at) VALUES (1, NOW(), $1, $2, NOW() + INTERVAL '5 minutes')",
      [testLockKey, testOwnerToken]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM booking_locks WHERE lock_key = $1', [testLockKey]);
    await pool.end();
  });

  it('Debe realizar un rollback completo (DB + Lock) y manejar comas en el motivo', async () => {
    const payload = {
      booking_id: testBookingId,
      lock_key: testLockKey,
      owner_token: testOwnerToken,
      reason: 'Error, connection timed out, retrying...' // Test GHC-2548 (Comma Bug)
    };

    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, payload);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.data.steps.db.success).toBe(true);
    expect(response.data.data.steps.lock.success).toBe(true);

    // Verificar DB
    const dbRes = await pool.query('SELECT status, cancellation_reason FROM bookings WHERE id = $1', [testBookingId]);
    expect(dbRes.rows[0].status).toBe('CANCELLED');
    expect(dbRes.rows[0].cancellation_reason).toBe(payload.reason);

    // Verificar Lock borrado
    const lockRes = await pool.query('SELECT * FROM booking_locks WHERE lock_key = $1', [testLockKey]);
    expect(lockRes.rows.length).toBe(0);
  });

  it('No debe liberar el lock si el owner_token es incorrecto (Seguridad)', async () => {
    // 1. Re-crear lock
    await pool.query(
      "INSERT INTO booking_locks (provider_id, start_time, lock_key, owner_token, expires_at) VALUES (1, NOW(), $1, $2, NOW() + INTERVAL '5 minutes')",
      [testLockKey, testOwnerToken]
    );

    const payload = {
      lock_key: testLockKey,
      owner_token: 'wrong_token'
    };

    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, payload);

    expect(response.data.data.steps.lock.success).toBe(true); // El flujo termina bien
    expect(response.data.data.steps.lock.was_released).toBe(false); // Pero no borró nada

    // Verificar que el lock sigue ahí
    const lockRes = await pool.query('SELECT * FROM booking_locks WHERE lock_key = $1', [testLockKey]);
    expect(lockRes.rows.length).toBe(1);
  });

  it('Debe ser resiliente si se intenta rollback de algo inexistente (Idempotencia)', async () => {
    const payload = {
      booking_id: '00000000-0000-0000-0000-000000000000', // No existe
      gcal_event_id: 'non_existent_event'
    };

    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, payload);

    expect(response.status).toBe(200);
    // GCal fallará, pero DB debería reportar success: true con was_updated: false
    expect(response.data.data.steps.db.success).toBe(true);
    expect(response.data.data.steps.db.was_updated).toBe(false);
  });
});
