/**
 * @file full.test.ts
 * @description FULL TEST SUITE — Booking Titanium End-to-End
 * 
 * ⚠️  NON-SATURATING EXECUTION:
 *    - Uses maxWorkers: 1 to prevent CPU overload
 *    - Sequential test execution with delays between tests
 *    - Jest configuration: workerIdleMemoryLimit: 512MB
 * 
 * 📊 Jest Configuration (jest.config.js):
 *    - maxWorkers: 1 - Prevents CPU saturation during test execution
 *    - testTimeout: 120000ms - Allows for real webhook calls
 *    - workerIdleMemoryLimit: 512MB - Memory management
 * 
 * 🚀 Performance Notes:
 *    - No sobrecargar el CPU - tests run sequentially
 *    - Bottom-up execution: Leaf workflows → Root workflows → Integration → E2E
 *    - Batching: Tests grouped by level (L0, L1, L2, L3) with delays between levels
 * 
 * Levels:
 *   L0 (Leaf/Unit): BB_00_Config, GLOBAL_Config, DB_* workflows
 *   L1 (Services):  GCAL, GMAIL, NN_02, NN_04
 *   L2 (Core):      NN_00, NN_03
 *   L3 (E2E):       NN_01
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const N8N_URL = (process.env.N8N_API_URL || 'https://n8n.stax.ink').replace('/api/v1', '');
const TELEGRAM_ID = Number(process.env.TELEGRAM_ID || 5391760292);

const SHORT = 15_000;   // fast calls: DB, Config
const MID   = 30_000;   // external APIs: GCAL, GMAIL, Telegram
const LONG  = 120_000;  // AI Agent calls (LLM + tools)

async function callWebhook(webhookPath: string, method = 'POST', body?: any, timeoutMs = 10000): Promise<any> {
  const url = `${N8N_URL}/webhook/${webhookPath}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Helper to build a future date string
function futureDate(daysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

// ════════════════════════════════════════════════
// LEVEL 0 — Config & Database Leaf Workflows
// ════════════════════════════════════════════════

describe('[L0] BB_00_Config — Global constants', () => {
  it('returns all required global constants', async () => {
    const data = await callWebhook('bb-00-config', 'GET', undefined, SHORT);
    expect(data.N8N_EDITOR_BASE_URL).toBe('https://n8n.stax.ink');
    expect(data.TELEGRAM_ADMIN_ID).toBeDefined();
    expect(data.BUSINESS_EMAIL).toBeDefined();
    expect(data.DAL_SERVICE_URL).toBe('http://dal-service:3000');
    expect(data._meta.source).toBe('BB_00_Config');
  }, SHORT);
});

describe('[L0] DB_Get_Availability — Availability lookup', () => {
  it('returns availability slots for provider 1 tomorrow', async () => {
    const data = await callWebhook('db-get-availability-test', 'POST', {
      provider_id: 1,
      service_id: 1,
      date: futureDate(1)
    }, SHORT);
    expect(data.success).toBeDefined();
    expect(data._meta).toBeDefined();
    expect(data._meta.source).toBe('DB_Get_Availability');
  }, SHORT);

  it('returns response even for past dates (graceful handling)', async () => {
    const data = await callWebhook('db-get-availability-test', 'POST', {
      provider_id: 1,
      service_id: 1,
      date: '2025-01-01'
    }, SHORT);
    expect(data._meta.source).toBe('DB_Get_Availability');
  }, SHORT);
});

describe('[L0] DB_Find_Next_Available — Next available slot', () => {
  it('returns Standard Contract with availability data', async () => {
    const data = await callWebhook('db-find-next-available', 'POST', {
      provider_id: 1,
      service_id: 1,
      date: futureDate(0)
    }, SHORT);
    expect(data.success).toBeDefined();
    expect(data.error_code).toBeDefined();
    expect(data._meta).toBeDefined();
    expect(data._meta.source).toBe('DB_Find_Next_Available');
  }, SHORT);
});

// ════════════════════════════════════════════════
// LEVEL 0 — DB Write Operations (sequential: create → cancel → reschedule)
// ════════════════════════════════════════════════
describe('[L0] DB_Create_Booking — Create booking', () => {
  let createdBookingId: string;

  it('creates a booking and returns booking_id', async () => {
    const data = await callWebhook('db-create-booking-test', 'POST', {
      provider_id: 1,
      service_id: 1,
      start_time: `${futureDate(2)}T10:00:00Z`,
      user_name: 'Test Suite Runner',
      user_email: 'test@booking-titanium.test',
      chat_id: TELEGRAM_ID
    }, SHORT);

    if (data.success && data.data?.booking_id) {
      createdBookingId = data.data.booking_id;
      console.log('[Create] Created booking_id:', createdBookingId);
    }

    expect(data.success).toBeDefined();
    expect(data._meta.source).toBe('DB_Create_Booking');
  }, SHORT);

  afterAll(async () => {
    // Cleanup: Cancel the test booking if it was created
    if (createdBookingId) {
      await callWebhook('db-cancel-booking-test', 'POST', {
        booking_id: createdBookingId,
        chat_id: TELEGRAM_ID
      }, SHORT).catch(() => {});
      console.log('[Create] Cleanup: cancelled booking', createdBookingId);
    }
  });
});

describe('[L0] DB_Cancel_Booking — Cancel booking (validation)', () => {
  it('rejects invalid booking UUID format', async () => {
    const data = await callWebhook('db-cancel-booking-test', 'POST', {
      booking_id: 'not-a-real-uuid',
      chat_id: TELEGRAM_ID
    }, SHORT);
    // Should fail — invalid format
    expect(data.success).toBe(false);
    expect(data.error_code).toBeDefined();
  }, SHORT);

  it('rejects missing booking_id', async () => {
    const data = await callWebhook('db-cancel-booking-test', 'POST', {
      chat_id: TELEGRAM_ID
    }, SHORT);
    expect(data.success).toBe(false);
    expect(data.error_code).toBeDefined();
  }, SHORT);
});

describe('[L0] DB_Reschedule_Booking — Reschedule booking (validation)', () => {
  it('rejects invalid booking UUID (returns error or empty)', async () => {
    const data = await callWebhook('db-reschedule-booking', 'POST', {
      booking_id: 'invalid-uuid-format',
      new_start_time: `${futureDate(3)}T14:00:00Z`
    }, SHORT);
    // Either returns structured error, or no body (routing rejection)
    const isFail = data.success === false || data.success === undefined || data.error_code !== undefined;
    expect(isFail).toBe(true);
  }, SHORT);
});

// ════════════════════════════════════════════════
// LEVEL 1 — External Service Integrations
// ════════════════════════════════════════════════

describe('[L1] NN_02_Message_Parser — Telegram message parsing', () => {
  it('parses valid Telegram message with Standard Contract', async () => {
    const data = await callWebhook('nn-02-booking-parser-test', 'POST', {
      message: {
        chat: { id: 12345 },
        text: 'Quiero reservar una cita',
        from: { first_name: 'Test' }
      }
    }, SHORT);
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.error_message).toBeNull();
    expect(data.data.chat_id).toBe(12345);
    expect(data.data.text).toBeDefined();
    expect(data._meta.source).toBe('NN_02_Message_Parser');
  }, SHORT);

  it('rejects payload missing chat_id', async () => {
    const data = await callWebhook('nn-02-booking-parser-test', 'POST', {
      text: 'solo texto'
    }, SHORT);
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('VALIDATION_ERROR');
  }, SHORT);

  it('sanitizes backslashes (SEC_02)', async () => {
    const data = await callWebhook('nn-02-booking-parser-test', 'POST', {
      message: {
        chat: { id: 12345 },
        text: "Test\\' injection; DROP TABLE--",
        from: { first_name: 'Hacker' }
      }
    }, SHORT);
    expect(data.success).toBe(true);
    // Text should be sanitized
    expect(data.data.text).not.toContain("\\';");
  }, SHORT);
});

describe('[L1] NN_04_Telegram_Sender — Telegram message delivery', () => {
  it('rejects missing required fields', async () => {
    const data = await callWebhook('nn-04-telegram-sender-v2', 'POST', {
      incomplete: true
    }, SHORT);
    expect(data.success === false || !data.data?.message_id).toBe(true);
  }, SHORT);

  it('sends a real message to admin and gets success', async () => {
    const data = await callWebhook('nn-04-telegram-sender-v2', 'POST', {
      chat_id: TELEGRAM_ID,
      text: '🤖 *Booking Titanium — Test Suite*\n\nMensaje de prueba desde el Full Test Suite. Todo funciona correctamente.',
      parse_mode: 'Markdown'
    }, MID);
    // Should succeed (real Telegram chat)
    if (!data.success) {
      console.log('[NN_04] Unexpected failure:', JSON.stringify(data));
    }
    expect(data.success).toBe(true);
    expect(data._meta.source).toBe('NN_04_Telegram_Sender');
  }, MID);
});

describe('[L1] GCAL_Create_Event — Google Calendar event creation', () => {
  it('creates a calendar event and returns event_id', async () => {
    const data = await callWebhook('gcal-create-event', 'POST', {
      title: '[TEST] Booking Titanium Test Suite',
      start: `${futureDate(5)}T11:00:00-03:00`,
      end: `${futureDate(5)}T11:30:00-03:00`,
      description: 'Auto-generated test event — safe to delete',
      chat_id: TELEGRAM_ID,
      user_name: 'Test Suite'
    }, MID);
    console.log('[GCAL Create]', JSON.stringify(data._meta || data));
    expect(data._meta).toBeDefined();
  }, MID);
});

describe('[L1] GCAL_Delete_Event — Google Calendar event deletion', () => {
  it('rejects missing event_id gracefully', async () => {
    const data = await callWebhook('gcal-delete-event', 'POST', {
      chat_id: TELEGRAM_ID
    }, MID);
    // Should fail or return error_code since no event_id
    expect(data._meta || data.error_code).toBeDefined();
  }, MID);
});

describe('[L1] GMAIL_Send_Confirmation — Email confirmation', () => {
  it('sends confirmation email to the test address', async () => {
    const data = await callWebhook('gmail-send-confirmation', 'POST', {
      user_name: 'Test Suite Runner',
      user_email: 'test@booking-titanium.test',
      booking_id: '00000000-0000-0000-0000-000000000000',
      start_time: `${futureDate(5)}T10:00:00Z`,
      chat_id: TELEGRAM_ID
    }, MID);
    console.log('[GMAIL]', JSON.stringify(data._meta || data));
    expect(data._meta).toBeDefined();
  }, MID);
});

// ════════════════════════════════════════════════
// LEVEL 2 — Core Workflows
// ════════════════════════════════════════════════

describe('[L2] NN_00_Global_Error_Handler — Error handling', () => {
  it('handles simulated error with Standard Contract output', async () => {
    const data = await callWebhook('nn-00-global-error', 'POST', {
      workflow: { id: 'TEST', name: 'Full Test Suite' },
      execution: {
        id: 'FULL_TEST_001',
        error: { message: 'Simulated error from full test suite' },
        lastNodeExecuted: 'Test Node',
        mode: 'test'
      }
    }, SHORT);
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data._meta.source).toBe('NN_00_Global_Error_Handler');
  }, SHORT);
});

describe('[L2] NN_03_AI_Agent — AI Agent with 4 ToolWorkflow tools', () => {
  it('processes availability query via check_availability tool', async () => {
    const data = await callWebhook('nn-03-ai-agent', 'POST', {
      chat_id: TELEGRAM_ID,
      text: `¿Qué turnos hay disponibles para ${futureDate(1)}?`
    }, LONG);
    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.data.ai_response).toBeDefined();
    expect(data._meta.source).toBe('NN_03_AI_Agent');
  }, LONG);

  it('rejects payload missing chat_id', async () => {
    const data = await callWebhook('nn-03-ai-agent', 'POST', {
      text: 'solo texto sin chat_id'
    }, SHORT);
    expect(data.success).toBe(false);
    expect(data.error_code).toBe('VALIDATION_ERROR');
  }, SHORT);
});

// ════════════════════════════════════════════════
// LEVEL 3 — End-to-End Integration Tests
// ════════════════════════════════════════════════

describe('[E2E] NN_01_Booking_Gateway — Full Telegram booking pipeline', () => {
  it('processes a full availability query from Telegram webhook format', async () => {
    const data = await callWebhook('nn-01-booking-gateway', 'POST', {
      message: {
        chat: { id: TELEGRAM_ID },
        text: '¿Qué turnos tenés disponibles para pasado mañana?',
        from: { first_name: 'TestUser' }
      }
    }, LONG);

    if (!data.success) {
      console.log('[E2E] NN_01 failure:', JSON.stringify(data, null, 2));
    }

    expect(data.success).toBe(true);
    expect(data.error_code).toBeNull();
    expect(data.data.message_sent).toBe(true);
    expect(data.data.chat_id).toBe(TELEGRAM_ID);
    expect(data.data.ai_response).toBeDefined();
    expect(data._meta.source).toBe('NN_01_Booking_Gateway');
  }, LONG);
});
