import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const DB_CREATE_WEBHOOK = `${N8N_URL}/webhook/db-create-booking`; 

describe('DB_Create_Booking Paranoia Tests', () => {
  const TIMEOUT = 15000;
  
  // Happy Path needs a unique key
  const uniqueIdempotency = `test_booking_${Date.now()}`;
  const validPayload = {
    idempotency_key: uniqueIdempotency,
    provider_id: 1,
    service_id: 1,
    start_time: '2026-05-20T10:00:00Z',
    end_time: '2026-05-20T11:00:00Z',
    chat_id: 12345,
    status: 'CONFIRMED'
  };

  it('runs Happy Path successfully', async () => {
    const res = await axios.post(DB_CREATE_WEBHOOK, validPayload);
    const data = res.data;
    
    expect(data.success).toBe(true);
    expect(data.data.booking_id).toBeDefined();
    expect(data.data.status).toBe('CONFIRMED');
    expect(data._meta).toBeDefined();
  }, TIMEOUT);

  it('handles Indempotent Duplicate without raising DB errors', async () => {
    const res = await axios.post(DB_CREATE_WEBHOOK, validPayload);
    const data = res.data;
    
    expect(data.success).toBe(true);
    // Is duplicate flag should be set to true by Format Success Output or Return Duplicate node
    expect(data.data.is_duplicate).toBe(true);
    expect(data.data.booking_id).toBeDefined();
    expect(data.error_code).toBeNull();
  }, TIMEOUT);

  it('rejects missing idempotency_key', async () => {
    const res = await axios.post(DB_CREATE_WEBHOOK, { ...validPayload, idempotency_key: undefined });
    const data = res.data;
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('MISSING_FIELD');
    expect(data._meta).toBeDefined();
  }, TIMEOUT);

  it('rejects missing start_time', async () => {
    const res = await axios.post(DB_CREATE_WEBHOOK, { ...validPayload, start_time: null, idempotency_key: uniqueIdempotency + '_2' });
    const data = res.data;
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('MISSING_FIELD');
    expect(data._meta).toBeDefined();
  }, TIMEOUT);

  it('rejects invalid type: provider_id as zero', async () => {
    const res = await axios.post(DB_CREATE_WEBHOOK, { ...validPayload, provider_id: 0, idempotency_key: uniqueIdempotency + '_3' });
    const data = res.data;
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('INVALID_TYPE');
    expect(data._meta).toBeDefined();
  }, TIMEOUT);

  it('rejects invalid range: end_time before start_time', async () => {
    const res = await axios.post(DB_CREATE_WEBHOOK, { ...validPayload, start_time: '2026-06-20T10:00:00Z', end_time: '2026-06-20T09:00:00Z', idempotency_key: uniqueIdempotency + '_4' });
    const data = res.data;
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('INVALID_RANGE');
    expect(data._meta).toBeDefined();
  }, TIMEOUT);

  it('rejects strict ISO normalization: Feb 30th', async () => {
    const res = await axios.post(DB_CREATE_WEBHOOK, { ...validPayload, start_time: '2026-02-30T10:00:00Z', idempotency_key: uniqueIdempotency + '_5' });
    const data = res.data;
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('INVALID_TYPE'); // Date fails ISO validation
    expect(data._meta).toBeDefined();
  }, TIMEOUT);

});
