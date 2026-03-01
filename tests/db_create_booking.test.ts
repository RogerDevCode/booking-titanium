import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../scripts-ts/.env') });

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/db-create-booking-test';

describe('DB_Create_Booking DAL Workflow', () => {
    it('should successfully create a booking and return a UUID', async () => {
        const payload = {
            chat_id: 5391760292,
            provider_id: 1,
            service_id: 1,
            start_time: '2026-03-02T10:00:00Z',
            user_email: 'paciente@test.com',
            user_name: 'Paciente de Prueba'
        };

        try {
            const response = await axios.post(WEBHOOK_URL, payload, { timeout: 30000 });
            const data = response.data;

            expect(data.success).toBe(true);
            expect(data.data).toHaveProperty('booking_id');
            expect(typeof data.data.booking_id).toBe('string');
            console.log(`✅ Reserva creada con ID: ${data.data.booking_id}`);
        } catch (error: any) {
            throw new Error(`RED STATE: Workflow failed or not deployed. ${error.message}`);
        }
    }, 35000);

    it('should prevent double bookings for the same slot', async () => {
        const payload = {
            chat_id: 99999999,
            provider_id: 1,
            service_id: 1,
            start_time: '2026-03-02T10:00:00Z', // Mismo slot que el anterior
            user_email: 'otro@test.com'
        };

        const response = await axios.post(WEBHOOK_URL, payload, { timeout: 30000 });
        expect(response.data.success).toBe(false);
        expect(response.data.error_code).toBe('SLOT_OCCUPIED');
        console.log(`✅ Colisión bloqueada correctamente: ${response.data.error_message}`);
    }, 35000);
});
