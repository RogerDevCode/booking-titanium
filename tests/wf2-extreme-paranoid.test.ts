import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const WEBHOOK_PATH = 'booking-orchestrator';
const FULL_URL = `${API_URL}/webhook/${WEBHOOK_PATH}`;

describe('🕵️ WF2 EXTREME PARANOID SUITE', () => {
  
  const generatePayload = (overrides = {}) => ({
    provider_id: 1,
    service_id: 1,
    start_time: "2026-05-20T10:00:00.000Z",
    chat_id: 12345678,
    user_name: "Hacker Node",
    ...overrides
  });

  test('💀 ATTACK-01: Millisecond Race Condition (20 concurrent)', async () => {
    const payload = generatePayload({ 
      start_time: `2026-06-01T${Math.floor(Math.random()*24)}:00:00.000Z`,
      chat_id: Date.now() 
    });
    
    // Disparar 20 peticiones en paralelo exacto
    const requests = Array.from({ length: 20 }).map(() => 
      axios.post(FULL_URL, payload, { validateStatus: () => true, timeout: 30000 })
    );
    
    const results = await Promise.all(requests);
    const successes = results.filter(r => r.data?.success === true);
    
    console.log(`    Race Condition: ${successes.length} successes out of 20`);
    
    // PARANOIA: Bajo NINGUNA circunstancia puede haber más de 1 éxito para el mismo slot/idempotencia
    expect(successes.length).toBeLessThanOrEqual(1);
  }, 40000);

  test('💉 ATTACK-02: SQL Injection & Character Escaping', async () => {
    const maliciousPayload = generatePayload({
      user_name: "'; DROP TABLE bookings; --",
      chat_id: "9999999999) OR 1=1 --"
    });
    
    const res = await axios.post(FULL_URL, maliciousPayload, { validateStatus: () => true });
    
    // No debería explotar (HTTP 500), debería o fallar validación o insertar como texto plano
    expect(res.status).not.toBe(500);
  });

  test('💣 ATTACK-03: JSON Buffer Bomb (Large Payload)', async () => {
    const giantString = "A".repeat(1024 * 1024 * 2); // 2MB string
    const bombPayload = generatePayload({
      user_name: giantString
    });
    
    const res = await axios.post(FULL_URL, bombPayload, { validateStatus: () => true });
    
    // Debería ser rechazado por límite de tamaño o manejado sin crash
    expect(res.status).not.toBe(500);
  });

  test('⏳ ATTACK-04: Temporal Paradox (Invalid Dates)', async () => {
    const dates = [
      "2026-02-30T10:00:00Z", // Fecha inexistente
      "1970-01-01T00:00:00Z", // Unix Epoch (Pasado)
      "9999-12-31T23:59:59Z", // Futuro extremo
      "invalid-date-string"
    ];
    
    for (const date of dates) {
      const res = await axios.post(FULL_URL, generatePayload({ start_time: date }), { validateStatus: () => true });
      expect(res.data.success).toBe(false);
    }
  });

  test('🔑 ATTACK-05: Parameter Pollution', async () => {
    // n8n/express a veces toma el primer o último valor si se repite la llave en el query o body
    const urlWithPollution = `${FULL_URL}?provider_id=999&provider_id=1`;
    const res = await axios.post(urlWithPollution, generatePayload(), { validateStatus: () => true });
    
    // Si el sistema es robusto, no debería permitir ambigüedad o usar el validado
    expect(res.status).not.toBe(500);
  });

});
