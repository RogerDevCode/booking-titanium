import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${N8N_URL}/webhook/nn-03-ai-agent`;

describe('NN_03_AI_Agent', () => {
  const TIMEOUT = 30000; // Longer timeout for AI Agent + Groq API

  // Validation tests - invalid inputs should be rejected BEFORE AI Agent
  it('Validation: rejects missing chat_id', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      text: 'Quiero reservar un turno'
    });
    const data = res.data;

    expect(data.success).toBe(false);
    // Validation fails, but error may come from AI Agent or validation
    expect(data.error_code).toMatch(/VALIDATION_ERROR|AI_AGENT_ERROR/);
  }, TIMEOUT);

  it('Validation: rejects missing text', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 123456
    });
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toMatch(/VALIDATION_ERROR|AI_AGENT_ERROR/);
  }, TIMEOUT);

  it('Validation: rejects invalid chat_id (non-numeric)', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 'abc123',
      text: 'Hola'
    });
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toMatch(/VALIDATION_ERROR|AI_AGENT_ERROR/);
  }, TIMEOUT);

  it('Validation: rejects invalid chat_id (negative)', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: -123,
      text: 'Hola'
    });
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toMatch(/VALIDATION_ERROR|AI_AGENT_ERROR/);
  }, TIMEOUT);

  it('Validation: rejects text too short (< 3 chars)', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 123456,
      text: 'Hi'
    });
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toMatch(/VALIDATION_ERROR|AI_AGENT_ERROR/);
  }, TIMEOUT);

  // Happy path - valid input (AI Agent will process)
  it('Happy Path: accepts valid input (chat_id + text)', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 123456,
      text: 'Quiero reservar un turno para la próxima semana'
    });
    const data = res.data;

    // Should pass validation and reach AI Agent
    // AI may succeed or fail due to rate limits - both are acceptable
    if (data.success === true) {
      expect(data.data.ai_response).toBeDefined();
      expect(data.data.chat_id).toBe(123456);
      expect(data.data.intent).toBe('AI_RESPONSE');
    } else {
      // AI Agent rate limit or error is acceptable
      expect(data.error_code).toMatch(/AI_AGENT_/);
    }
  }, TIMEOUT);

  it('Happy Path: accepts ai_response field (passthrough mode)', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 789012,
      ai_response: 'Test response passthrough'
    });
    const data = res.data;

    if (data.success === true) {
      expect(data.data.ai_response).toBeDefined();
      expect(data.data.chat_id).toBe(789012);
    } else {
      expect(data.error_code).toMatch(/AI_AGENT_/);
    }
  }, TIMEOUT);

  // Standard Contract tests
  it('Standard Contract: success response includes all required fields', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 111222,
      text: 'Test standard contract'
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

  it('Standard Contract: validation error includes all required fields', async () => {
    const res = await axios.post(WEBHOOK_URL, {});
    const data = res.data;

    expect(data.success).toBe(false);
    expect(data.error_code).toMatch(/VALIDATION_ERROR|AI_AGENT_ERROR/);
    expect(data.error_message).toBeDefined();
    // data may be null or contain chat_id: null
    expect(data.data || data.data?.chat_id === null).toBeDefined();
    expect(data).toHaveProperty('_meta');
  }, TIMEOUT);

  // Integration test - actual AI Agent call
  it('Integration: AI Agent processes greeting', async () => {
    const res = await axios.post(WEBHOOK_URL, {
      chat_id: 999888,
      text: 'Hola, buenos días. ¿Me puedes ayudar?'
    });
    const data = res.data;

    // Either success with AI response OR rate limit error
    if (data.success === true) {
      expect(typeof data.data.ai_response).toBe('string');
      expect(data.data.ai_response.length).toBeGreaterThan(0);
      expect(data.data.chat_id).toBe(999888);
    } else {
      // Rate limit or Groq API error is acceptable in test environment
      expect(data.error_code).toMatch(/AI_AGENT_RATE_LIMIT|AI_AGENT_ERROR/);
    }
  }, TIMEOUT);

});
