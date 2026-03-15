/**
 * Smoke tests for Booking Titanium critical workflows
 * Runs against REAL n8n server via webhooks (TEST_RIGOR: 100% real)
 * 
 * Usage: npx jest tests/smoke.test.ts --testTimeout=30000
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const N8N_URL = process.env.N8N_API_URL?.replace('/api/v1', '') || 'https://n8n.stax.ink';

async function callWebhook(path: string, method: string = 'GET', body?: any): Promise<any> {
  const url = `${N8N_URL}/webhook/${path}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  return res.json();
}

// ═══════════════════════════════════════════════
// BB_00_Config — Global constants
// ═══════════════════════════════════════════════
describe('BB_00_Config', () => {
  it('returns all required global constants', async () => {
    const data = await callWebhook('bb-00-config');
    expect(data.N8N_EDITOR_BASE_URL).toBe('https://n8n.stax.ink');
    expect(data.TELEGRAM_ADMIN_ID).toBeDefined();
    expect(data.BUSINESS_EMAIL).toBeDefined();
    expect(data.DAL_SERVICE_URL).toBe('http://dal-service:3000');
    expect(data._meta.source).toBe('BB_00_Config');
  });
});

// ═══════════════════════════════════════════════
// NN_02_Message_Parser — Telegram message parsing
// ═══════════════════════════════════════════════
describe('NN_02_Message_Parser', () => {
  it('parses valid Telegram message with Standard Contract', async () => {
    const data = await callWebhook('nn-02-booking-parser-test', 'POST', {
      message: {
        chat: { id: 12345 },
        text: 'Quiero reservar una cita',
        from: { first_name: 'Test' }
      }
    });
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.error_message).toBeNull();
    expect(data.data.chat_id).toBe(12345);
    expect(data.data.text).toBeDefined();
    expect(data._meta.source).toBe('NN_02_Message_Parser');
  });

  it('rejects payload missing chat_id', async () => {
    const data = await callWebhook('nn-02-booking-parser-test', 'POST', {
      text: 'solo texto'
    });
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('VALIDATION_ERROR');
  });

  it('sanitizes backslashes (SEC_02)', async () => {
    const data = await callWebhook('nn-02-booking-parser-test', 'POST', {
      chat_id: 12345,
      text: "Test\\' injection; DROP TABLE--"
    });
    expect(data.success).toBe(true);
    // Backslash and quote should be escaped
    expect(data.data.text).not.toContain("\\';");
  });
});

// ═══════════════════════════════════════════════
// NN_04_Telegram_Sender — requires chat_id + text
// ═══════════════════════════════════════════════
describe('NN_04_Telegram_Sender', () => {
  it('rejects missing required fields', async () => {
    const data = await callWebhook('nn-04-telegram-sender', 'POST', {
      incomplete: true
    });
    // Should fail validation — either success:false or error response
    expect(data.success === false || data.error || !data.data?.message_id).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// DB_Find_Next_Available — availability lookup
// ═══════════════════════════════════════════════
describe('DB_Find_Next_Available', () => {
  it('returns Standard Contract with availability data', async () => {
    const data = await callWebhook('db-find-next-available', 'POST', {
      provider_id: 1,
      service_id: 1,
      date: new Date().toISOString().split('T')[0]
    });
    expect(data.success).toBeDefined();
    expect(data.error_code).toBeDefined(); // null or string
    expect(data._meta).toBeDefined();
    expect(data._meta.source).toBe('DB_Find_Next_Available');
  });
});

// ═══════════════════════════════════════════════
// NN_00_Global_Error_Handler — error handling
// ═══════════════════════════════════════════════
describe('NN_00_Global_Error_Handler', () => {
  it('handles simulated error with Standard Contract output', async () => {
    const data = await callWebhook('nn-00-global-error', 'POST', {
      workflow: { id: 'TEST', name: 'Smoke Test' },
      execution: {
        id: 'SMOKE_TEST_001',
        error: { message: 'Simulated error from smoke test' },
        lastNodeExecuted: 'Test Node',
        mode: 'test'
      }
    });
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data._meta.source).toBe('NN_00_Global_Error_Handler');
  });
});

// ═══════════════════════════════════════════════
// NN_03_AI_Agent — AI Agent with 4 ToolWorkflow tools
// Uses extended timeout: LLM (Groq) + tool calls ~90-120s
// ═══════════════════════════════════════════════
describe('NN_03_AI_Agent', () => {
  const AI_TIMEOUT = 120_000; // 120s for LLM + tool execution

  it('processes availability query via check_availability tool', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const data = await callWebhook('nn-03-ai-agent', 'POST', {
      chat_id: 88801,
      text: `¿Qué turnos hay disponibles para ${dateStr}?`
    });
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.error_message).toBeNull();
    expect(data.data.intent).toBe('AI_RESPONSE');
    expect(data.data.chat_id).toBe(88801);
    expect(data.data.ai_response).toBeDefined();
    expect(data._meta.source).toBe('NN_03_AI_Agent');
  }, AI_TIMEOUT);

  it('rejects payload missing chat_id with Standard Contract error', async () => {
    const data = await callWebhook('nn-03-ai-agent', 'POST', {
      text: 'solo texto sin chat_id'
    });
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('VALIDATION_ERROR');
  }, AI_TIMEOUT);
});

// ═══════════════════════════════════════════════
// NN_01_Booking_Gateway — Main entry point (Parser -> AI -> Telegram)
// ═══════════════════════════════════════════════
describe('NN_01_Booking_Gateway', () => {
  const GATEWAY_TIMEOUT = 120_000;

  it('processes a full E2E booking query from Telegram format', async () => {
    const adminChatId = Number(process.env.TELEGRAM_ID || 5391760292);
    
    const data = await callWebhook('nn-01-booking-gateway', 'POST', {
      message: {
        chat: { id: adminChatId },
        text: '¿Qué turnos tenés disponibles para pasado mañana?',
        from: { first_name: 'TestUser' }
      }
    });

    if (!data.success) {
      console.log('NN_01 E2E Error:', JSON.stringify(data, null, 2));
    }

    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    // Validate output structure from Final Response node in NN_01
    expect(data.data.message_sent).toBe(true);
    expect(data.data.chat_id).toBe(adminChatId);
    expect(data.data.ai_response).toBeDefined();
    expect(data._meta.source).toBe('NN_01_Booking_Gateway');
  }, GATEWAY_TIMEOUT);
});
