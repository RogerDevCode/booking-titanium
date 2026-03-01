import express from 'express';
import { Client } from 'pg';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(express.json());

const dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
};

async function getAvailability(provider_id: number, service_id: number, date: string) {
    console.log(`[DAL] Buscando disponibilidad: ${date}`);
    const client = new Client(dbConfig);
    try {
        await client.connect();
        const dt = DateTime.fromISO(date);
        const pg_dow = dt.weekday === 7 ? 0 : dt.weekday;

        const query = `
            SELECT 
                (SELECT row_to_json(conf) FROM (SELECT s.duration_min, s.buffer_min, p.name FROM public.services s JOIN public.provider_services ps ON ps.service_id = s.id JOIN public.providers p ON p.id = ps.provider_id WHERE p.id = $1 AND s.id = $2) conf) as config,
                (SELECT row_to_json(sch) FROM (SELECT start_time, end_time FROM public.provider_schedules WHERE provider_id = $1 AND day_of_week = $3) sch) as schedule,
                (SELECT json_agg(bk) FROM (SELECT start_time, end_time FROM public.bookings WHERE provider_id = $1 AND status = 'CONFIRMED' AND start_time::date = $4::date) bk) as bookings;
        `;
        const res = await client.query(query, [provider_id, service_id, pg_dow, date]);
        const dbData = res.rows[0];

        if (!dbData.config || !dbData.schedule) return { success: true, data: { slots: [] }, message: "No working hours found" };

        const slots = [];
        const { duration_min, buffer_min, name } = dbData.config;
        const { start_time, end_time } = dbData.schedule;
        const bookings = dbData.bookings || [];

        let current = DateTime.fromISO(`${date}T${start_time}`, { zone: 'utc' });
        const finish = DateTime.fromISO(`${date}T${end_time}`, { zone: 'utc' });

        while (current.plus({ minutes: duration_min }) <= finish) {
            const sStart = current;
            const sEnd = current.plus({ minutes: duration_min });
            const isBusy = bookings.some((b: any) => (sStart < DateTime.fromISO(b.end_time, { zone: 'utc' }) && sEnd > DateTime.fromISO(b.start_time, { zone: 'utc' })));
            if (!isBusy) slots.push({ start_time: sStart.toISO(), end_time: sEnd.toISO(), display_time: sStart.toFormat('HH:mm') });
            current = sEnd.plus({ minutes: buffer_min });
        }
        return { success: true, data: { slots, provider_name: name, date }, _meta: { source: "DAL_Proxy", timestamp: new Date().toISOString() } };
    } catch (err: any) {
        console.error('[DAL ERROR]', err.message);
        return { success: false, error_message: err.message };
    } finally {
        await client.end().catch(() => {});
    }
}

async function createBookingAtomic(payload: any) {
    console.log('[DAL] Creando reserva atómica...');
    const client = new Client(dbConfig);
    try {
        await client.connect();
        const { chat_id, provider_id, service_id, start_time, user_email, user_name } = payload;
        const atomicQuery = `
            WITH service_info AS (SELECT duration_min FROM public.services WHERE id = $3),
            user_upsert AS (INSERT INTO public.users (chat_id, email, full_name) VALUES ($1, $5, $6) ON CONFLICT (chat_id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name RETURNING chat_id),
            collision AS (SELECT id FROM public.bookings WHERE provider_id = $2 AND status = 'CONFIRMED' AND (start_time, end_time) OVERLAPS ($4, ($4::timestamptz + (SELECT duration_min FROM service_info) * interval '1 minute')))
            INSERT INTO public.bookings (provider_id, service_id, user_id, start_time, end_time, status)
            SELECT $2, $3, $1, $4, ($4::timestamptz + (SELECT duration_min FROM service_info) * interval '1 minute'), 'CONFIRMED'
            WHERE NOT EXISTS (SELECT 1 FROM collision) AND EXISTS (SELECT 1 FROM service_info)
            RETURNING id, start_time;
        `;
        const res = await client.query(atomicQuery, [chat_id, provider_id, service_id, start_time, user_email, user_name]);
        if (res.rows.length === 0) return { success: false, error_code: "SLOT_OCCUPIED", error_message: "Slot taken" };
        return { success: true, data: { booking_id: res.rows[0].id, start_time: res.rows[0].start_time } };
    } catch (err: any) {
        return { success: false, error_message: err.message };
    } finally {
        await client.end().catch(() => {});
    }
}

app.post('/get-slots', async (req, res) => res.json(await getAvailability(req.body.provider_id, req.body.service_id, req.body.date)));
app.post('/create-booking', async (req, res) => {
    const result = await createBookingAtomic(req.body);
    res.status(result.success ? 200 : 400).json(result);
});

app.listen(3000, '0.0.0.0', () => console.log('🚀 Medical DAL Ready'));
