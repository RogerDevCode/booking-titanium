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

const TEST_PROVIDER_ID = 999;
const TEST_START_TIME = '2026-03-20T10:00:00';
const TEST_LOCK_KEY = `lock_${TEST_PROVIDER_ID}_2026-03-20T10:00:00`;

jest.setTimeout(30000);

describe('Distributed Lock System TDD', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM booking_locks WHERE lock_key = $1', [TEST_LOCK_KEY]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM booking_locks WHERE lock_key = $1', [TEST_LOCK_KEY]);
    await pool.end();
  });

  let ownerToken: string;

  describe('Acquire Lock', () => {
    it('Debe adquirir un lock nuevo exitosamente', async () => {
      const response = await axios.post(`${N8N_WEBHOOK_URL}/acquire-lock`, {
        provider_id: TEST_PROVIDER_ID,
        start_time: TEST_START_TIME,
        lock_duration_minutes: 5
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.acquired).toBe(true);
      expect(response.data.data.owner_token).toBeDefined();
      
      ownerToken = response.data.data.owner_token;

      // Verificar en DB
      const dbRes = await pool.query('SELECT * FROM booking_locks WHERE lock_key = $1', [TEST_LOCK_KEY]);
      expect(dbRes.rows.length).toBe(1);
      expect(dbRes.rows[0].owner_token).toBe(ownerToken);
    });

    it('Debe denegar la adquisición si el lock ya está tomado por otro', async () => {
      const response = await axios.post(`${N8N_WEBHOOK_URL}/acquire-lock`, {
        provider_id: TEST_PROVIDER_ID,
        start_time: TEST_START_TIME
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.acquired).toBe(false);
      expect(response.data.error_code).toBe('LOCK_HELD');
    });
  });

  describe('Release Lock', () => {
    it('No debe liberar el lock si el token es incorrecto (Security Check)', async () => {
      const response = await axios.post(`${N8N_WEBHOOK_URL}/release-lock`, {
        lock_key: TEST_LOCK_KEY,
        owner_token: 'wrong_token_123'
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.released).toBe(false);
      expect(response.data.error_code).toBe('LOCK_NOT_FOUND');

      // Verificar que el lock sigue en DB
      const dbRes = await pool.query('SELECT * FROM booking_locks WHERE lock_key = $1', [TEST_LOCK_KEY]);
      expect(dbRes.rows.length).toBe(1);
    });

    it('Debe liberar el lock exitosamente con el token correcto', async () => {
      const response = await axios.post(`${N8N_WEBHOOK_URL}/release-lock`, {
        lock_key: TEST_LOCK_KEY,
        owner_token: ownerToken
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.released).toBe(true);

      // Verificar que ya no existe en DB
      const dbRes = await pool.query('SELECT * FROM booking_locks WHERE lock_key = $1', [TEST_LOCK_KEY]);
      expect(dbRes.rows.length).toBe(0);
    });
  });

  describe('TTL & Auto-Cleanup', () => {
    it('Debe permitir re-adquirir un lock si el anterior ya expiró (CTE Cleanup)', async () => {
      // 1. Insertar manualmente un lock expirado
      await pool.query(
        'INSERT INTO booking_locks (provider_id, start_time, lock_key, owner_token, expires_at) VALUES ($1, $2, $3, $4, NOW() - INTERVAL \'1 second\')',
        [TEST_PROVIDER_ID, TEST_START_TIME, TEST_LOCK_KEY, 'old_token']
      );

      // 2. Intentar adquirirlo vía Webhook
      const response = await axios.post(`${N8N_WEBHOOK_URL}/acquire-lock`, {
        provider_id: TEST_PROVIDER_ID,
        start_time: TEST_START_TIME
      });

      expect(response.status).toBe(200);
      expect(response.data.data.acquired).toBe(true);
      expect(response.data.data.owner_token).not.toBe('old_token');
    });
  });
});
