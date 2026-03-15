import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Use production webhook URL (not localhost, not webhook-test)
const N8N_WEBHOOK_URL = process.env.WEBHOOK_URL?.replace(/\/$/, '') || 'https://n8n.stax.ink/webhook';

const dbUrl = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

jest.setTimeout(90000);

describe('WF2_Booking_Orchestrator v3.2 TDD', () => {
  const testProviderId = 1;
  const testServiceId = 1;
  const testStartTime = '2026-10-31T10:00:00Z';
  const testCustomerId = 'tdd_user_' + Date.now();

  const cleanTime = String(testStartTime).replace(/[^0-9]/g, '');
  const idempotencyKey = `booking_${testProviderId}_${testServiceId}_${cleanTime}_${testCustomerId}`;

  let gcalEventId: string | null = null;
  let bookingId: number | null = null;
  let lockKey: string | null = null;

  beforeAll(async () => {
    await pool.query('DELETE FROM bookings WHERE idempotency_key = $1', [idempotencyKey]);
    await pool.query('DELETE FROM booking_locks WHERE provider_id = $1 AND start_time = $2', [testProviderId, testStartTime]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bookings WHERE idempotency_key = $1', [idempotencyKey]);
    await pool.end();
  });

  describe('Happy Path & Context Preservation', () => {
    it('Debe orquestar una reserva exitosa completa (Lock -> Avail -> CB -> GCal -> DB -> Release)', async () => {
      const payload = {
        provider_id: testProviderId,
        service_id: testServiceId,
        start_time: testStartTime,
        duration_minutes: 60,
        user_id: 123456789, customer_id: testCustomerId,
        event_title: 'TDD Orchestrator v3.2 Test'
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, payload);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeDefined();
      
      gcalEventId = response.data.data.gcal_id || response.data.data.gcal_event_id;
      bookingId = response.data.data.booking_id;

      expect(gcalEventId).toBeDefined();
      expect(bookingId).toBeDefined();

      // Verify Lock was released
      const safeTime = testStartTime.replace(/[^a-zA-Z0-9T:.+\-]/g, '_');
      const tempLockKey = `lock_${testProviderId}_${safeTime}`;
      const lockRes = await pool.query('SELECT * FROM booking_locks WHERE lock_key = $1', [tempLockKey]);
      expect(lockRes.rows.length).toBe(0);
    });

    it('Debe retornar is_duplicate: true si se reintenta (Idempotencia)', async () => {
      const payload = {
        provider_id: testProviderId,
        service_id: testServiceId,
        start_time: testStartTime,
        duration_minutes: 60,
        user_id: 123456789, customer_id: testCustomerId
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, payload);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.is_duplicate).toBe(true);
      expect(response.data.data.booking_id).toBe(bookingId);
    });
  });

  describe('Race Condition & Locking', () => {
    it('Debe denegar la reserva con LOCK_DENIED si el slot está ocupado', async () => {
      const dummyTime = '2026-11-01T10:00:00Z';
      const safeTime = dummyTime.replace(/[^a-zA-Z0-9T:.+\-]/g, '_');
      const tempLockKey = `lock_${testProviderId}_${safeTime}`;

      await pool.query(
        "INSERT INTO booking_locks (provider_id, start_time, lock_key, owner_token, expires_at) VALUES ($1, $2, $3, 'thief', NOW() + INTERVAL '5 minutes')",
        [testProviderId, dummyTime, tempLockKey]
      );

      const payload = {
        provider_id: testProviderId,
        service_id: testServiceId,
        start_time: dummyTime,
        duration_minutes: 60,
        user_id: 123456789,
        customer_id: 'another_user'
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, payload);

      expect(response.data.success).toBe(false);
      expect(response.data.error_code).toBe('LOCK_DENIED');

      await pool.query('DELETE FROM booking_locks WHERE lock_key = $1', [tempLockKey]);
    });
  });

  describe('DB Failure & Rollback', () => {
    it('Debe liberar lock si la Base de Datos falla al insertar (Rollback)', async () => {
      const payload = {
        provider_id: testProviderId,
        service_id: 999999, // Trigger FK error
        start_time: '2026-11-02T10:00:00Z',
        duration_minutes: 60,
        user_id: 123456789,
        customer_id: 'db_fail_user'
      };

      const safeTime = payload.start_time.replace(/[^a-zA-Z0-9T:.+\-]/g, '_');
      const tempLockKey = `lock_${testProviderId}_${safeTime}`;

      const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, payload);

      expect(response.data.success).toBe(false);
      // It might be DB_INSERT_FAILED or DB_ERROR depending on which SCO node it reached
      expect(response.data.error_code).toMatch(/DB_/);

      // CRITICAL: Ensure lock was released
      const lockRes = await pool.query('SELECT * FROM booking_locks WHERE lock_key = $1', [tempLockKey]);
      expect(lockRes.rows.length).toBe(0);
    });
  });
});
