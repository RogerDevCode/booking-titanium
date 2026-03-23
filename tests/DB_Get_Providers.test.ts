import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${N8N_URL}/webhook/db-get-providers`;

describe('DB_Get_Providers Paranoia Tests', () => {
  const TIMEOUT = 15000;

  it('Happy Path: fetch all providers (active not specified)', async () => {
    const res = await axios.post(WEBHOOK_URL, {});
    const data = res.data;
    
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.data.active_filter).toBe(null);
    expect(Array.isArray(data.data.providers)).toBe(true);
    expect(typeof data.data.total).toBe('number');
    
    // Each provider should match the schema
    if (data.data.providers.length > 0) {
      const p = data.data.providers[0];
      expect(typeof p.id).toBe('number');
      expect(typeof p.name).toBe('string');
      expect(typeof p.active).toBe('boolean');
    }
  }, TIMEOUT);

  it('Happy Path: fetch active=true providers', async () => {
    const res = await axios.post(WEBHOOK_URL, { active: true });
    const data = res.data;
    
    expect(data.success).toBe(true);
    expect(data.data.active_filter).toBe(true);
    
    // All returned providers should literally be active
    const inactiveProviders = data.data.providers.filter((p: any) => p.active !== true);
    expect(inactiveProviders.length).toBe(0);
  }, TIMEOUT);

  it('Happy Path: fetch active=false providers', async () => {
    const res = await axios.post(WEBHOOK_URL, { active: false });
    const data = res.data;
    
    expect(data.success).toBe(true);
    expect(data.data.active_filter).toBe(false);
    
    // All returned providers should literally be inactive
    const activeProviders = data.data.providers.filter((p: any) => p.active !== false);
    expect(activeProviders.length).toBe(0);
  }, TIMEOUT);

  it('accepts string "true" logic for active', async () => {
    const res = await axios.post(WEBHOOK_URL, { active: 'true' });
    const data = res.data;
    expect(data.success).toBe(true);
    expect(data.data.active_filter).toBe(true);
  }, TIMEOUT);

  it('accepts string "1" logic for active', async () => {
    const res = await axios.post(WEBHOOK_URL, { active: '1' });
    const data = res.data;
    expect(data.success).toBe(true);
    expect(data.data.active_filter).toBe(true);
  }, TIMEOUT);

  it('accepts string "false" logic for active', async () => {
    const res = await axios.post(WEBHOOK_URL, { active: 'false' });
    const data = res.data;
    expect(data.success).toBe(true);
    expect(data.data.active_filter).toBe(false);
  }, TIMEOUT);

  it('rejects invalid active parameter type (number)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { active: 100 });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('rejects invalid active parameter type (invalid string)', async () => {
    try {
      const res = await axios.post(WEBHOOK_URL, { active: 'yes' });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
    } catch (error: any) {
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

});
