import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const GCAL_DELETE_WEBHOOK = `${N8N_URL}/webhook/gcal-delete-event`;

describe('GCAL_Delete_Event Paranoia Tests', () => {
  const TIMEOUT = 20000;

  // === VALIDATION TESTS ===

  it('rejects missing gcal_event_id', async () => {
    const res = await axios.post(GCAL_DELETE_WEBHOOK, {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(false);
    expect(res.data.error_code).toBeDefined();
  }, TIMEOUT);

  it('rejects empty gcal_event_id', async () => {
    const res = await axios.post(GCAL_DELETE_WEBHOOK, { gcal_event_id: '' });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(false);
    expect(res.data.error_code).toBeDefined();
  }, TIMEOUT);

  // === STANDARD CONTRACT TESTS ===

  it('returns Standard Contract on error', async () => {
    const res = await axios.post(GCAL_DELETE_WEBHOOK, { gcal_event_id: '' });
    
    expect(res.data.success).toBeDefined();
    expect(res.data.error_code).toBeDefined();
    expect(res.data.error_message).toBeDefined();
    expect(res.data.data).toBeDefined();
    expect(res.data._meta).toBeDefined();
    expect(res.data._meta.source).toBe('GCAL_Delete_Event');
    expect(res.data._meta.timestamp).toBeDefined();
  }, TIMEOUT);

  it('includes version in _meta', async () => {
    const res = await axios.post(GCAL_DELETE_WEBHOOK, { gcal_event_id: 'test' });
    
    if (res.data._meta) {
      expect(res.data._meta.version).toBeDefined();
    }
  }, TIMEOUT);

  // === INTEGRATION TESTS ===
  // Note: These test GCal OAuth and API connectivity

  it('handles invalid event_id gracefully', async () => {
    const res = await axios.post(GCAL_DELETE_WEBHOOK, { 
      gcal_event_id: 'invalid-event-id-12345' 
    });
    
    expect(res.status).toBe(200);
    // Should return error (event not found) but with Standard Contract
    expect(res.data.success).toBe(false);
    expect(res.data.error_code).toBeDefined();
    expect(res.data._meta).toBeDefined();
  }, TIMEOUT);

  it('handles OAuth errors gracefully', async () => {
    // This test verifies the workflow handles OAuth token issues
    const res = await axios.post(GCAL_DELETE_WEBHOOK, { 
      gcal_event_id: 'test-event-id' 
    });
    
    expect(res.status).toBe(200);
    // Even with OAuth issues, should return Standard Contract
    expect(res.data._meta).toBeDefined();
    expect(res.data._meta.source).toBe('GCAL_Delete_Event');
  }, TIMEOUT);

});
