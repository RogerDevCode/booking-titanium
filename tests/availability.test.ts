/**
 * @file availability.test.ts
 * @description WF3_Availability_Service TDD - DB + GCal collision detection
 * 
 * ⚠️  NON-SATURATING EXECUTION:
 *    - Uses maxWorkers: 1 to prevent CPU overload
 *    - Sequential test execution with delays between tests
 *    - Jest configuration: workerIdleMemoryLimit: 512MB
 * 
 * 📊 Jest Configuration (jest.config.js):
 *    - maxWorkers: 1 - Prevents CPU saturation during test execution
 *    - testTimeout: 30000ms - Allows for real webhook calls
 *    - workerIdleMemoryLimit: 512MB - Memory management
 * 
 * 🚀 Performance Notes:
 *    - No sobrecargar el CPU - tests run sequentially
 *    - Database connections are reused via connection pool
 *    - Batching: Tests execute one at a time to avoid DB contention
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

const TEST_PROVIDER_ID = 1;
const TEST_SERVICE_ID = 1;
const TEST_START_TIME = '2026-03-25T14:00:00';

jest.setTimeout(30000);

describe('Availability Service TDD', () => {
  beforeAll(async () => {
    // Cleanup any existing bookings for the test slot
    await pool.query('DELETE FROM bookings WHERE provider_id = $1 AND start_time = $2', [TEST_PROVIDER_ID, TEST_START_TIME]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bookings WHERE provider_id = $1 AND start_time = $2', [TEST_PROVIDER_ID, TEST_START_TIME]);
    await pool.end();
  });

  it('Debe retornar available: true si no hay colisiones en DB ni GCal', async () => {
    const response = await axios.post(`${N8N_WEBHOOK_URL}/check-availability`, {
      provider_id: TEST_PROVIDER_ID,
      service_id: TEST_SERVICE_ID,
      start_time: TEST_START_TIME
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.data.available).toBe(true);
    expect(response.data.data.db_available).toBe(true);
  });

  it('Debe retornar available: false si hay una reserva confirmada en la DB', async () => {
    // Insert confirmed booking
    const endTime = new Date(new Date(TEST_START_TIME).getTime() + 60 * 60000).toISOString();
    await pool.query(
      'INSERT INTO bookings (provider_id, service_id, start_time, end_time, status, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [TEST_PROVIDER_ID, TEST_SERVICE_ID, TEST_START_TIME, endTime, 'CONFIRMED', '123456789']
    );

    const response = await axios.post(`${N8N_WEBHOOK_URL}/check-availability`, {
      provider_id: TEST_PROVIDER_ID,
      service_id: TEST_SERVICE_ID,
      start_time: TEST_START_TIME
    });

    expect(response.data.data.available).toBe(false);
    expect(response.data.data.db_available).toBe(false);
    expect(response.data.data.db_count).toBe(1);
  });

  it('Debe retornar error de validación si faltan campos obligatorios', async () => {
    const response = await axios.post(`${N8N_WEBHOOK_URL}/check-availability`, {
      provider_id: TEST_PROVIDER_ID
    });
    
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(false);
    expect(response.data.error_code).toBe('VALIDATION_ERROR');
  });
});
