import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const NN04_WEBHOOK = `${N8N_URL}/webhook/nn-04-telegram-sender`;

describe('NN_04_Telegram_Sender Paranoia Tests', () => {
  const TIMEOUT = 15000;
  
  const validPayload = {
    chat_id: 9000000000,
    text: 'Test message from Jest'
  };

  it('rejects missing chat_id', async () => {
    try {
      const res = await axios.post(NN04_WEBHOOK, { text: validPayload.text });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('MISSING_FIELD');
      expect(data._meta).toBeDefined();
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('MISSING_FIELD');
    }
  }, TIMEOUT);

  it('rejects invalid chat_id (string instead of int)', async () => {
    try {
      const res = await axios.post(NN04_WEBHOOK, { chat_id: 'invalid_chat_id', text: validPayload.text });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
      expect(data._meta).toBeDefined();
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('rejects invalid chat_id (negative int)', async () => {
    try {
      const res = await axios.post(NN04_WEBHOOK, { chat_id: -100, text: validPayload.text });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_TYPE');
      expect(data._meta).toBeDefined();
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_TYPE');
    }
  }, TIMEOUT);

  it('rejects missing text and ai_response', async () => {
    try {
      const res = await axios.post(NN04_WEBHOOK, { chat_id: validPayload.chat_id });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('MISSING_FIELD');
      expect(data._meta).toBeDefined();
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('MISSING_FIELD');
    }
  }, TIMEOUT);

  it('rejects text that is too long (>4096 characters)', async () => {
    try {
      const longText = 'a'.repeat(4097);
      const res = await axios.post(NN04_WEBHOOK, { chat_id: validPayload.chat_id, text: longText });
      const data = res.data;
      expect(data.success).toBe(false);
      expect(data.error_code).toBe('INVALID_INPUT');
      expect(data._meta).toBeDefined();
    } catch (error: any) {
      const res = error.response?.data || error.response;
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('INVALID_INPUT');
    }
  }, TIMEOUT);

  it('handles Telegram chat not found gracefully', async () => {
    try {
      // 9000000000 is likely not a valid chat the bot can access right now
      const res = await axios.post(NN04_WEBHOOK, validPayload);
      const data = res.data;
      
      // If by some miracle it's a real chat_id the bot can send to, it succeeds
      if (data.success) {
        expect(data.data.message_id).toBeDefined();
        expect(data._meta).toBeDefined();
      } else {
        expect(data.success).toBe(false);
        expect(data.error_code).toBe('TELEGRAM_CHAT_NOT_FOUND');
        expect(data._meta).toBeDefined();
      }
    } catch (error: any) {
      console.error('Test threw an error:', error.message, error.response?.data);
      const res = error.response?.data || error.response || {};
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('TELEGRAM_CHAT_NOT_FOUND');
    }
  }, TIMEOUT);

});
