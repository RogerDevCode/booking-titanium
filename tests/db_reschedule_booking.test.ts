import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../scripts-ts/.env') });

const CREATE_URL = 'https://n8n.stax.ink/webhook/db-create-booking-test';
const RESCHEDULE_URL = 'https://n8n.stax.ink/webhook/db-reschedule-booking-test';

describe('Booking Rescheduling System', () => {
    let oldBookingId: string;
    const chatId = 5391760292;

    it('should create an initial booking', async () => {
        const payload = {
            chat_id: chatId,
            provider_id: 1,
            service_id: 1,
            start_time: '2026-03-10T14:00:00Z'
        };
        const response = await axios.post(CREATE_URL, payload);
        oldBookingId = response.data.data.booking_id;
        expect(oldBookingId).toBeDefined();
    }, 30000);

    it('should successfully reschedule to a new time', async () => {
        const payload = {
            old_booking_id: oldBookingId,
            chat_id: chatId,
            new_start_time: '2026-03-10T16:00:00Z'
        };
        try {
            const response = await axios.post(RESCHEDULE_URL, payload, { timeout: 30000 });
            const data = response.data;

            expect(data.success).toBe(true);
            expect(data.data.old_booking_id).toBe(oldBookingId);
            expect(data.data.new_booking_id).not.toBe(oldBookingId);
            console.log(`✅ Reserva reagendada. Nueva ID: ${data.data.new_booking_id}`);
        } catch (e: any) {
            throw new Error(`RED STATE: Workflow not deployed. ${e.message}`);
        }
    }, 35000);
});
