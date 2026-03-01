import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../scripts-ts/.env') });

const CREATE_URL = 'https://n8n.stax.ink/webhook/db-create-booking-test';
const CANCEL_URL = 'https://n8n.stax.ink/webhook/db-cancel-booking-test';

describe('Booking Cancellation DAL System', () => {
    let bookingId: string;
    const chatId = 5391760292;

    it('should create a booking first', async () => {
        const payload = {
            chat_id: chatId,
            provider_id: 1,
            service_id: 1,
            start_time: '2026-03-05T10:00:00Z',
            user_email: 'cancel-test@test.com'
        };
        const response = await axios.post(CREATE_URL, payload);
        bookingId = response.data.data.booking_id;
        expect(bookingId).toBeDefined();
    }, 30000);

    it('should successfully cancel the created booking', async () => {
        const payload = {
            booking_id: bookingId,
            chat_id: chatId
        };
        const response = await axios.post(CANCEL_URL, payload);
        const data = response.data;

        expect(data.success).toBe(true);
        expect(data.data.booking_id).toBe(bookingId);
        console.log(`✅ Reserva ${bookingId} cancelada con éxito.`);
    }, 30000);

    it('should fail when trying to cancel an already cancelled booking', async () => {
        const payload = {
            booking_id: bookingId,
            chat_id: chatId
        };
        const response = await axios.post(CANCEL_URL, payload);
        expect(response.data.success).toBe(false);
        expect(response.data.error_code).toBe('ALREADY_CANCELLED');
    }, 30000);
});
