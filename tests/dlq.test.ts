/**
 * @file dlq.test.ts
 * @description DLQ_System TDD - Dead Letter Queue for failed executions
 * 
 * ⚠️  NON-SATURATING EXECUTION:
 *    - Uses maxWorkers: 1 to prevent CPU overload
 *    - Sequential test execution with delays between tests
 *    - Jest configuration: workerIdleMemoryLimit: 512MB
 * 
 * 📊 Jest Configuration (jest.config.js):
 *    - maxWorkers: 1 - Prevents CPU saturation during test execution
 *    - testTimeout: 60000ms - Allows for real webhook calls
 *    - workerIdleMemoryLimit: 512MB - Memory management
 * 
 * 🚀 Performance Notes:
 *    - No sobrecargar el CPU - tests run sequentially
 *    - Database cleanup after each test
 *    - Batching: DLQ tests include retry interval delays
 */

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

const TEST_IDEMPOTENCY_KEY = 'dlq_tdd_' + Date.now();

jest.setTimeout(30000);

describe('DLQ System TDD', () => {
  beforeAll(async () => {
    // Cleanup any existing test data
    await pool.query('DELETE FROM booking_dlq WHERE idempotency_key = $1', [TEST_IDEMPOTENCY_KEY]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM booking_dlq WHERE idempotency_key = $1', [TEST_IDEMPOTENCY_KEY]);
    await pool.end();
  });

  describe('DLQ_01_Add_Entry', () => {
    it('Debe agregar un registro exitosamente, incluso con comas en el mensaje (Bug Comma Test)', async () => {
      const payload = {
        booking_id: 12345,
        provider_id: 1,
        service_id: 1,
        failure_reason: 'TEST_FAILURE',
        error_message: 'Error, with a comma, punctuation!', // CRITICAL TEST CASE
        original_payload: {
          customer_id: 999,
          chat_id: 888,
          start_time: '2026-03-15T10:00:00'
        },
        idempotency_key: TEST_IDEMPOTENCY_KEY
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/dlq/add`, payload);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.dlq_id).toBeDefined();

      // Verificar persistencia real y decodificación correcta
      const dbResult = await pool.query('SELECT * FROM booking_dlq WHERE idempotency_key = $1', [TEST_IDEMPOTENCY_KEY]);
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].last_error_message).toBe('Error, with a comma, punctuation!');
    });
  });

  describe('DLQ_02_Get_Status', () => {
    it('Debe retornar el resumen de items pendientes', async () => {
      const response = await axios.get(`${N8N_WEBHOOK_URL}/dlq/status`);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.pending_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DLQ_Retry (Simulation via Logic)', () => {
    it('Debe seleccionar el item para reintento debido a que ya pasó el intervalo (2 min)', async () => {
      // Forzar el next_retry_at al pasado para que el retry worker lo vea
      await pool.query('UPDATE booking_dlq SET next_retry_at = NOW() - INTERVAL \'1 minute\' WHERE idempotency_key = $1', [TEST_IDEMPOTENCY_KEY]);
      
      const readyItems = await pool.query('SELECT * FROM view_booking_dl_ready_retry WHERE idempotency_key = $1', [TEST_IDEMPOTENCY_KEY]);
      expect(readyItems.rows.length).toBe(1);
    });
  });
});
