import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.stax.ink/webhook';

const TEST_START = '2026-06-15T10:00:00Z';
const TEST_END = '2026-06-15T11:00:00Z';

jest.setTimeout(30000);

describe('GCal Collision Check TDD', () => {
  
  it('Debe validar correctamente un slot libre (suponiendo que no hay nada el 2026-06-15)', async () => {
    const response = await axios.post(`${N8N_WEBHOOK_URL}/gcal-collision-check`, {
      start_time: TEST_START,
      duration_minutes: 60
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.data.slot_available).toBeDefined();
  });

  it('Debe fallar si el formato de fecha es basura', async () => {
    const response = await axios.post(`${N8N_WEBHOOK_URL}/gcal-collision-check`, {
      start_time: 'esto-no-es-una-fecha',
      duration_minutes: 60
    });

    expect(response.data.success).toBe(false);
    expect(response.data.error_code).toBe('VALIDATION_ERROR');
  });

  it('Debe rechazar duraciones absurdas (Ataque DoS)', async () => {
    const response = await axios.post(`${N8N_WEBHOOK_URL}/gcal-collision-check`, {
      start_time: TEST_START,
      duration_minutes: 999999
    });

    expect(response.data.success).toBe(false);
    expect(response.data.error_message).toMatch(/duration/i);
  });

  it('MODO DEGRADADO: Debe "Fallar Cerrado" (slot_available: false) si el ID de calendario es inválido', async () => {
    // Forzamos un error de GCal pasando un provider_id que no existe o configurando mal el calendar
    const response = await axios.post(`${N8N_WEBHOOK_URL}/gcal-collision-check`, {
      start_time: TEST_START,
      duration_minutes: 60,
      calendar_id: 'invalid-calendar-id@gmail.com'
    });

    // Si la API falla, por seguridad Titanium el slot NO debe estar disponible
    expect(response.data.data.slot_available).toBe(false);
    expect(response.data.error_code).toBe('GCAL_ERROR');
  });
});
