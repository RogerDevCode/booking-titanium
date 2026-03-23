import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const DB_AVAIL_WEBHOOK = `${N8N_URL}/webhook/db-get-availability`;

describe('DB_Get_Availability Paranoia Tests', () => {
  const TIMEOUT = 15000;
  
  const validPayload = {
    provider_id: 1,
    service_id: 1,
    date: '2026-05-15'
  };

  it('runs Happy Path successfully', async () => {
    const res = await axios.post(DB_AVAIL_WEBHOOK, validPayload);
    const data = res.data;
    
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.data.provider_id).toBe(validPayload.provider_id);
    expect(data.data.service_id).toBe(validPayload.service_id);
    expect(data.data.date).toBe(validPayload.date);
    expect(Array.isArray(data.data.slots)).toBe(true);
    expect(typeof data.data.total_available).toBe('number');
    expect(data._meta).toBeDefined();
  }, TIMEOUT);

  it('rejects missing provider_id', async () => {
    try {
      const res = await axios.post(DB_AVAIL_WEBHOOK, { service_id: 1, date: '2026-05-15' });
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
      const res = await axios.post(DB_AVAIL_WEBHOOK, { ...validPayload, provider_id: 'abc' });
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
      const res = await axios.post(DB_AVAIL_WEBHOOK, { ...validPayload, provider_id: 0 });
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
      const res = await axios.post(DB_AVAIL_WEBHOOK, { provider_id: 1, date: '2026-05-15' });
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
      const res = await axios.post(DB_AVAIL_WEBHOOK, { provider_id: 1, service_id: 1 });
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
      const res = await axios.post(DB_AVAIL_WEBHOOK, { ...validPayload, date: '15-05-2026' });
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
      const res = await axios.post(DB_AVAIL_WEBHOOK, { ...validPayload, date: '2026-02-30' });
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
