import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../scripts-ts/.env') });

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/db-get-availability-test';

describe('DB_Get_Availability DAL Workflow', () => {
    it('should return available slots for a given provider and date', async () => {
        const payload = {
            provider_id: 1,
            service_id: 1,
            date: '2026-03-02' // Lunes
        };

        const response = await axios.post(WEBHOOK_URL, payload, { timeout: 30000 });
        const data = response.data;

        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('slots');
        expect(Array.isArray(data.data.slots)).toBe(true);
        
        // El Dr. Roger trabaja de 09:00 a 17:00. Deberíamos tener slots.
        expect(data.data.slots.length).toBeGreaterThan(0);
        console.log(`Slots encontrados: ${data.data.slots.length}`);
        console.log(`Primer slot: ${data.data.slots[0].display_time}`);
    }, 35000);
});
