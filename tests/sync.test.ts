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

jest.setTimeout(60000);

describe('Sync Engine TDD', () => {
  let testBookingId: string;
  const testGCalId = 'tdd_event_' + Date.now();

  beforeAll(async () => {
    // 1. Create a confirmed booking WITHOUT gcal_event_id
    const bRes = await pool.query(
      "INSERT INTO bookings (provider_id, service_id, start_time, end_time, status, user_id) VALUES (1, 1, NOW() + INTERVAL '2 hours', NOW() + INTERVAL '3 hours', 'CONFIRMED', 123456789) RETURNING id"
    );
    testBookingId = bRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.end();
  });

  describe('WF4_Sync_Engine (Cron Repair)', () => {
    it('Debe encontrar la reserva sin sincronizar y "repararla" (simulado)', async () => {
      const response = await axios.post(`${N8N_WEBHOOK_URL}/sync-repair-manual`, {});

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      
      const dbRes = await pool.query('SELECT gcal_event_id FROM bookings WHERE id = $1', [testBookingId]);
      console.log('Sync Result ID:', dbRes.rows[0].gcal_event_id);
    });
  });

  describe('WF4_Sync_Engine_Event_Driven', () => {
    it('Debe cancelar la reserva en DB cuando llega un evento "cancelled" de GCal', async () => {
      // 1. Update test booking with a fake GCal ID
      await pool.query('UPDATE bookings SET gcal_event_id = $1 WHERE id = $2', [testGCalId, testBookingId]);

      // 2. Trigger the event-driven webhook
      const payload = {
        source: 'google_apps_script',
        event: {
          id: testGCalId,
          status: 'cancelled'
        }
      };

      const response = await axios.post(`${N8N_WEBHOOK_URL}/gcal-sync-trigger`, payload);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.action_taken).toBe('booking_cancelled');

      // 3. Verify DB status
      const dbRes = await pool.query('SELECT status FROM bookings WHERE id = $1', [testBookingId]);
      expect(dbRes.rows[0].status).toBe('CANCELLED');
    });
  });
});
