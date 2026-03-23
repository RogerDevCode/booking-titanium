import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${N8N_URL}/webhook/db-get-providers-by-service`;

describe('DB_Get_Providers_By_Service', () => {
  const TIMEOUT = 15000;

  // Happy Path tests
  it('Happy Path: fetch providers for service_id=1', async () => {
    const res = await axios.post(WEBHOOK_URL, { service_id: 1 });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.data.service_id).toBe(1);
    expect(Array.isArray(data.data.providers)).toBe(true);
    expect(typeof data.data.total).toBe('number');

    // Each provider should match the schema
    if (data.data.providers.length > 0) {
      const p = data.data.providers[0];
      expect(typeof p.id).toBe('number');
      expect(typeof p.name).toBe('string');
      expect(typeof p.email).toBe('string');
      expect(typeof p.active).toBe('boolean');
    }
  }, TIMEOUT);

  it('Happy Path: fetch providers for service_id=2', async () => {
    const res = await axios.post(WEBHOOK_URL, { service_id: 2 });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.service_id).toBe(2);
    expect(Array.isArray(data.data.providers)).toBe(true);
  }, TIMEOUT);

  it('Happy Path: fetch providers with string service_id="1"', async () => {
    const res = await axios.post(WEBHOOK_URL, { service_id: '1' });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.service_id).toBe(1);
  }, TIMEOUT);

  it('Happy Path: returns empty array when service has no providers', async () => {
    // Use a service_id that likely doesn't exist
    const res = await axios.post(WEBHOOK_URL, { service_id: 9999 });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.providers).toEqual([]);
    expect(data.data.total).toBe(0);
    expect(data.data.service_id).toBe(9999);
  }, TIMEOUT);

  // Validation tests - MISSING_FIELD
  it('Validation: rejects missing service_id', async () => {
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
  it('Validation: rejects invalid service_id type (boolean)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { service_id: true });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid service_id type (string "abc")', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { service_id: 'abc' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid service_id type (float)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { service_id: 1.5 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid service_id type (zero)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { service_id: 0 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('Validation: rejects invalid service_id type (negative)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { service_id: -1 });
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
    const res = await axios.post(WEBHOOK_URL, { service_id: 1 });
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
