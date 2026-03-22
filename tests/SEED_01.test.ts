import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const SEED_WEBHOOK = `${N8N_URL}/webhook/seed-daily-prod-v1`;
const SEED_AUTH_TOKEN = process.env.SEED_AUTH_TOKEN || 'test';

describe('SEED_01 Daily Provisioning Paranoia Tests', () => {
  const TIMEOUT = 15000;

  it('rejects missing auth token natively', async () => {
    try {
      await axios.post(SEED_WEBHOOK, { test: true });
    } catch (error: any) {
      const res = error.response?.data || error.response;
      // It returns SUCCESS FALSE and 401 code from inside standard contract
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('AUTH_FAILED');
      expect(res._meta).toBeDefined();
    }
  }, TIMEOUT);

  it('rejects invalid auth token', async () => {
    try {
      await axios.post(SEED_WEBHOOK, { test: true }, { headers: { 'x-seed-token': 'wrong-token' } });
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('AUTH_FAILED');
      expect(res._meta).toBeDefined();
    }
  }, TIMEOUT);

  it('runs successfully with correct auth token', async () => {
    const res = await axios.post(SEED_WEBHOOK, { test: true }, { headers: { 'x-seed-token': SEED_AUTH_TOKEN } });
    const data = res.data;
    expect(data.success).toBe(true);
    // Since it's a success, updated AST ensures error_code is null
    expect(data.error_code).toBe(null);
    expect(data.error_message).toBe(null);
    expect(data.data.expected_slots).toBeDefined();
    expect(data._meta).toBeDefined();
  }, TIMEOUT * 2);

});
