import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${N8N_URL}/webhook/db-get-services`;

describe('DB_Get_Services', () => {
  const TIMEOUT = 15000;

  // Happy Path tests
  it('Happy Path: fetch services for provider_id=1', async () => {
    const res = await axios.post(WEBHOOK_URL, { provider_id: 1 });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.data.provider_id).toBe(1);
    expect(Array.isArray(data.data.services)).toBe(true);
    expect(typeof data.data.total).toBe('number');

    // Each service should match the schema
    if (data.data.services.length > 0) {
      const s = data.data.services[0];
      expect(typeof s.id).toBe('number');
      expect(typeof s.name).toBe('string');
    }
  }, TIMEOUT);

  it('Happy Path: fetch services with string provider_id="1"', async () => {
    const res = await axios.post(WEBHOOK_URL, { provider_id: '1' });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.provider_id).toBe(1);
  }, TIMEOUT);

  it('Happy Path: returns empty array when provider has no services', async () => {
    // Use a provider_id that likely doesn't exist
    const res = await axios.post(WEBHOOK_URL, { provider_id: 9999 });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.services).toEqual([]);
    expect(data.data.total).toBe(0);
    expect(data.data.provider_id).toBe(9999);
  }, TIMEOUT);

  // Validation tests - MISSING_FIELD
  it('Validation: rejects missing provider_id', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, {});
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('MISSING_FIELD');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('MISSING_FIELD');
    }
  }, TIMEOUT);

  // Validation tests - INVALID_TYPE
  it('Validation: rejects invalid provider_id type (boolean)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { provider_id: true });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid provider_id type (string "abc")', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { provider_id: 'abc' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid provider_id type (float)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { provider_id: 1.5 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid provider_id type (zero)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { provider_id: 0 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid provider_id type (negative)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { provider_id: -1 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  // Standard Contract tests
  it('Standard Contract: response includes all required fields', async () => {
    const res = await axios.post(WEBHOOK_URL, { provider_id: 1 });
    const data = res.data;

    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('error_code');
    expect(data).toHaveProperty('error_message');
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('_meta');
    expect(data._meta).toHaveProperty('source');
    expect(data._meta).toHaveProperty('timestamp');
    expect(data._meta).toHaveProperty('workflow_id');
  }, TIMEOUT);

  it('Standard Contract: error response includes all required fields', async () => {
    try {
      await axios.post(WEBHOOK_URL, {});
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res).toHaveProperty('success');
      expect(res).toHaveProperty('error_code');
      expect(res).toHaveProperty('error_message');
      expect(res).toHaveProperty('data');
      expect(res.data).toBeNull();
    }
  }, TIMEOUT);

});
