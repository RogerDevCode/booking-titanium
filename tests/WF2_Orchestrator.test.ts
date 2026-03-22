import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WF2_WEBHOOK = `${N8N_URL}/webhook/booking-orchestrator`;

describe('WF2 Booking Orchestrator Paranoia Tests', () => {
  const TIMEOUT = 15000;

  it('rejects missing fields', async () => {
    try {
      await axios.post(WF2_WEBHOOK, { provider_id: 1 });
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_INPUT');
      expect(res._meta).toBeDefined();
    }
  }, TIMEOUT);

  it('rejects invalid iso date', async () => {
    try {
      await axios.post(WF2_WEBHOOK, { provider_id: 1, service_id: 1, start_time: '2026-14-99' });
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_DATE_FORMAT');
      expect(res._meta).toBeDefined();
    }
  }, TIMEOUT);

  it('rejects past dates', async () => {
    try {
      await axios.post(WF2_WEBHOOK, { provider_id: 1, service_id: 1, start_time: '2020-01-01T10:00:00Z' });
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('PAST_DATE');
      expect(res._meta).toBeDefined();
    }
  }, TIMEOUT);

  it('rejects future dates > 1 year', async () => {
    try {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 2);
      await axios.post(WF2_WEBHOOK, { provider_id: 1, service_id: 1, start_time: future.toISOString() });
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('FUTURE_DATE_TOO_EXTREME');
      expect(res._meta).toBeDefined();
    }
  }, TIMEOUT);

});
