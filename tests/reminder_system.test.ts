import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DateTime } from 'luxon';

dotenv.config({ path: path.resolve(__dirname, '../scripts-ts/.env') });

const DAL_URL = 'http://localhost:3000';

describe('Reminder System Logic (DAL Level)', () => {
    let bookingId: string;
    const chatId = 5391760292;

    it('should create a booking due for a reminder (in 1 hour)', async () => {
        const startTime = DateTime.now().plus({ hours: 1 }).toUTC().toISO();
        const { Client } = require('pg');
        const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        await client.connect();
        const res = await client.query(
            "INSERT INTO public.bookings (provider_id, service_id, user_id, start_time, end_time, reminder_1_hours, reminder_2_hours, reminder_1_sent, reminder_2_sent) VALUES (1, 1, $1, $2, ($2::timestamptz + interval '30 min'), 24, 2, FALSE, FALSE) RETURNING id",
            [chatId, startTime]
        );
        bookingId = res.rows[0].id;
        await client.end();
        expect(bookingId).toBeDefined();
    }, 20000);

    it('should fetch the pending reminder', async () => {
        const response = await axios.get(`${DAL_URL}/pending-reminders`, { timeout: 10000 });
        expect(response.data.data.find((b: any) => b.id === bookingId)).toBeDefined();
    }, 15000);

    it('should mark all applicable reminders as sent', async () => {
        // Marcamos tanto el tipo 1 como el tipo 2
        await axios.post(`${DAL_URL}/mark-reminder-sent`, { booking_id: bookingId, type: 1 });
        await axios.post(`${DAL_URL}/mark-reminder-sent`, { booking_id: bookingId, type: 2 });
        
        const response = await axios.get(`${DAL_URL}/pending-reminders`);
        expect(response.data.data.find((b: any) => b.id === bookingId)).toBeUndefined();
        console.log(`✅ Recordatorios para ${bookingId} procesados y limpiados.`);
    }, 15000);
});
