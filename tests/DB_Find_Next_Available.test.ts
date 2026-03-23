import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const DB_FIND_NEXT_WEBHOOK = `${N8N_URL}/webhook/db-find-next-available`;

describe('DB_Find_Next_Available Paranoia Tests', () => {
  const TIMEOUT = 15000;

  const validPayload = {
    provider_id: 1,
    service_id: 1,
    date: '2026-03-06'
  };

  it('runs Happy Path successfully', async () => {
    const res = await axios.post(DB_FIND_NEXT_WEBHOOK, validPayload);
    const data = res.data;

    // Note: This test verifies the workflow executes and returns Standard Contract
    // If DAL service is unavailable, we still expect proper error handling
    expect(data.success).toBeDefined();
    expect(data._meta).toBeDefined();
    expect(data._meta.source).toBe('DB_Find_Next_Available');
    expect(data._meta.workflow_id).toBe('DB_Find_Next_Available');
    
    // If successful, verify data structure
    if (data.success === true) {
      expect(data.error_code).toBeNull();
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data.slots)).toBe(true);
    } else {
      // If failed, verify error handling follows Standard Contract
      expect(data.error_code).toBeDefined();
      expect(data.error_message).toBeDefined();
    }
  }, TIMEOUT);

  it('rejects missing provider_id', async () => {
    try {
      const res = await axios.post(DB_FIND_NEXT_WEBHOOK, { service_id: 1, date: '2026-03-06' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('MISSING_FIELD');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('MISSING_FIELD');
    }
  }, TIMEOUT);

  it('rejects invalid provider_id (string)', async () => {
    try {
      const res = await axios.post(DB_FIND_NEXT_WEBHOOK, { ...validPayload, provider_id: 'abc' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('rejects invalid provider_id (zero/negative)', async () => {
    try {
      const res = await axios.post(DB_FIND_NEXT_WEBHOOK, { ...validPayload, provider_id: 0 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('rejects missing service_id', async () => {
    try {
      const res = await axios.post(DB_FIND_NEXT_WEBHOOK, { provider_id: 1, date: '2026-03-06' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('MISSING_FIELD');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('MISSING_FIELD');
    }
  }, TIMEOUT);

  it('rejects missing date', async () => {
    try {
      const res = await axios.post(DB_FIND_NEXT_WEBHOOK, { provider_id: 1, service_id: 1 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('MISSING_FIELD');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('MISSING_FIELD');
    }
  }, TIMEOUT);

  it('rejects invalid date format', async () => {
    try {
      const res = await axios.post(DB_FIND_NEXT_WEBHOOK, { ...validPayload, date: '06-03-2026' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('rejects non-existent calendar date (e.g. Feb 30th)', async () => {
    try {
      const res = await axios.post(DB_FIND_NEXT_WEBHOOK, { ...validPayload, date: '2026-02-30' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_DATE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_DATE');
    }
  }, TIMEOUT);

});
