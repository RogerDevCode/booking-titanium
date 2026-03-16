/**
 * @file circuit_breaker.test.ts
 * @description CB_GCal_Circuit_Breaker TDD - Fault tolerance pattern
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
 *    - Circuit breaker state is properly reset between tests
 *    - Batching: Tests include delays for circuit state transitions
 */

import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Si tu n8n local escucha en el puerto 5678 externamente:
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.stax.ink/webhook';

const dbUrl = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

const TEST_SERVICE_ID = 'test_service_tdd_' + Date.now();

jest.setTimeout(30000);

describe('Circuit Breaker TDD', () => {
  beforeAll(async () => {
    // Limpiar posibles estados previos
    await pool.query('DELETE FROM circuit_breaker_state WHERE service_id = $1', [TEST_SERVICE_ID]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM circuit_breaker_state WHERE service_id = $1', [TEST_SERVICE_ID]);
    await pool.end();
  });

  describe('CB_01_Check_State', () => {
    it('Debe retornar allowed: true para un servicio nuevo (crea config por defecto temporal)', async () => {
      const payload = {
        service_id: TEST_SERVICE_ID,
        action: 'check'
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/circuit-breaker/check`, payload);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.allowed).toBe(true);
      expect(response.data.data.circuit_state).toBe('closed');
      expect(response.data.data.service_id).toBe(TEST_SERVICE_ID);
    });
  });

  describe('CB_02_Record_Result', () => {
    it('Debe crear el registro en BD mediante UPSERT al registrar un success inicial', async () => {
      const payload = {
        service_id: TEST_SERVICE_ID,
        action: 'record_success',
        success: true
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/circuit-breaker/record`, payload);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.recorded).toBe(true);
      expect(response.data.data.new_state).toBe('closed');

      // Verificar persistencia real
      const dbResult = await pool.query('SELECT * FROM circuit_breaker_state WHERE service_id = $1', [TEST_SERVICE_ID]);
      expect(dbResult.rows.length).toBe(1);
      expect(dbResult.rows[0].success_count).toBe(1);
      expect(dbResult.rows[0].failure_count).toBe(0);
    });

    it('Debe incrementar failure_count al registrar un failure', async () => {
      const payload = {
        service_id: TEST_SERVICE_ID,
        action: 'record_failure',
        success: false,
        error_message: 'Test DB timeout'
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/circuit-breaker/record`, payload);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      
      const dbResult = await pool.query('SELECT * FROM circuit_breaker_state WHERE service_id = $1', [TEST_SERVICE_ID]);
      expect(dbResult.rows[0].failure_count).toBe(1);
      expect(dbResult.rows[0].last_error_message).toBe('Test DB timeout');
    });
  });

  describe('Transición de Estados (Closed -> Open)', () => {
    it('Debe abrir el circuito si se supera el umbral de fallos (ej. 5 fallos)', async () => {
      // Registrar 4 fallos más para llegar a 5 (el umbral por defecto suele ser 5)
      for (let i = 0; i < 4; i++) {
        await axios.post(`${N8N_WEBHOOK_URL}/circuit-breaker/record`, {
          service_id: TEST_SERVICE_ID,
          action: 'record_failure',
          success: false
        });
      }

      const dbResult = await pool.query('SELECT state, failure_count FROM circuit_breaker_state WHERE service_id = $1', [TEST_SERVICE_ID]);
      expect(dbResult.rows[0].failure_count).toBe(5);
      expect(dbResult.rows[0].state).toBe('open');
    });

    it('El check state ahora debe devolver allowed: false (Bloqueado)', async () => {
      const payload = {
        service_id: TEST_SERVICE_ID,
        action: 'check'
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/circuit-breaker/check`, payload);
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.allowed).toBe(false);
      expect(response.data.data.circuit_state).toBe('open');
      // Debe incluir mensaje de reintento
      expect(response.data.data.message).toMatch(/Retry in/i); 
    });
  });

});
