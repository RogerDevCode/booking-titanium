import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${N8N_URL}/webhook/nn-02-booking-parser-test`;

describe('NN_02_Message_Parser', () => {
  const TIMEOUT = 15000;

  // Happy Path tests
  it('Happy Path: parse Telegram message (standard format)', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      message: {
        chat: { id: 123456, first_name: 'Test' },
        text: 'Reservar cita',
        from: { first_name: 'Juan' }
      }
    });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.data.chat_id).toBe(123456);
    expect(data.data.text).toBe('Reservar cita');
    expect(data.data.username).toBe('Juan');
    expect(data.data.type).toBe('text');
  }, TIMEOUT);

  it('Happy Path: parse channel_post', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      channel_post: {
        chat: { id: 789012, first_name: 'Channel' },
        text: 'Anuncio importante'
      }
    });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.chat_id).toBe(789012);
    expect(data.data.text).toBe('Anuncio importante');
    expect(data.data.username).toBe('Channel'); // Falls back to chat.first_name
  }, TIMEOUT);

  it('Happy Path: parse flat format (chat_id, text at root)', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 345678,
      text: 'Mensaje directo',
      username: 'Maria'
    });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.chat_id).toBe(345678);
    expect(data.data.text).toBe('Mensaje directo');
    expect(data.data.username).toBe('Maria');
  }, TIMEOUT);

  it('Happy Path: sanitize text with special characters', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      message: {
        chat: { id: 111222, first_name: 'Test' },
        text: "Test with 'quotes' and \\backslashes",
        from: { first_name: 'Test' }
      }
    });
    const data = res.data;

    expect(data.success).toBe(true);
    expect(data.data.text).toContain("''quotes''");
    expect(data.data.text).toContain('\\\\backslashes');
  }, TIMEOUT);

  // Validation tests
  it('Validation: rejects missing chat_id', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      message: { text: 'No chat id' }
    });
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toBe('VALIDATION_ERROR');
  }, TIMEOUT);

  it('Validation: rejects missing text', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      message: { chat: { id: 999888 } }
    });
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toBe('VALIDATION_ERROR');
  }, TIMEOUT);

  it('Validation: rejects empty payload', async () => {
    const res = await axios.post(WEBHOOK_URL, {});
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toBe('VALIDATION_ERROR');
  }, TIMEOUT);

  // Standard Contract tests
  it('Standard Contract: success response includes all required fields', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      message: { chat: { id: 555666 }, text: 'Test' }
    });
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
    const res = await axios.post(WEBHOOK_URL, {});
    const data = res.data;

    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('error_code');
    expect(data).toHaveProperty('error_message');
    expect(data).toHaveProperty('data');
    expect(data.data).toBeNull();
    expect(data).toHaveProperty('_meta');
  }, TIMEOUT);

});
