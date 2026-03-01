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

// --- GET SLOTS ---
async function getAvailability(provider_id: number, service_id: number, date: string) {
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
        if (!dbData.config || !dbData.schedule) return { success: true, data: { slots: [] } };
        const slots = [];
        const { duration_min, buffer_min, name } = dbData.config;
        const { start_time, end_time } = dbData.schedule;
        const bookings = dbData.bookings || [];
        let current = DateTime.fromISO(`${date}T${start_time}`, { zone: 'utc' });
        const finish = DateTime.fromISO(`${date}T${end_time}`, { zone: 'utc' });
        while (current.plus({ minutes: duration_min }) <= finish) {
            const sStart = current;
            const sEnd = current.plus({ minutes: duration_min });
            const isBusy = bookings.some((b: any) => (sStart < DateTime.fromISO(b.start_time, { zone: 'utc' }) && sEnd > DateTime.fromISO(b.start_time, { zone: 'utc' })));
            if (!isBusy) slots.push({ start_time: sStart.toISO(), end_time: sEnd.toISO(), display_time: sStart.toFormat('HH:mm') });
            current = sEnd.plus({ minutes: buffer_min });
        }
        return { success: true, data: { slots, provider_name: name, date } };
    } catch (err: any) {
        return { success: false, error_message: err.message };
    } finally {
        await client.end().catch(() => {});
    }
}

// --- CREATE BOOKING ATOMIC ---
async function createBookingAtomic(payload: any) {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        const { chat_id, provider_id, service_id, start_time, user_email, user_name } = payload;
        const atomicQuery = `
            WITH service_info AS (SELECT duration_min, name as service_name FROM public.services WHERE id = $3),
            user_upsert AS (INSERT INTO public.users (chat_id, email, full_name) VALUES ($1, $5, $6) ON CONFLICT (chat_id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name RETURNING chat_id, full_name, email),
            collision AS (SELECT id FROM public.bookings WHERE provider_id = $2 AND status = 'CONFIRMED' AND (start_time, end_time) OVERLAPS ($4, ($4::timestamptz + (SELECT duration_min FROM service_info) * interval '1 minute')))
            INSERT INTO public.bookings (provider_id, service_id, user_id, start_time, end_time, status)
            SELECT $2, $3, $1, $4, ($4::timestamptz + (SELECT duration_min FROM service_info) * interval '1 minute'), 'CONFIRMED'
            WHERE NOT EXISTS (SELECT 1 FROM collision) AND EXISTS (SELECT 1 FROM service_info)
            RETURNING id, start_time, end_time, (SELECT full_name FROM user_upsert) as user_name, (SELECT email FROM user_upsert) as user_email, (SELECT service_name FROM service_info) as service_name;
        `;
        const res = await client.query(atomicQuery, [chat_id, provider_id, service_id, start_time, user_email, user_name]);
        if (res.rows.length === 0) return { success: false, error_code: "SLOT_OCCUPIED", error_message: "Slot taken" };
        const b = res.rows[0];
        return { success: true, data: { booking_id: b.id, start_time: b.start_time, end_time: b.end_time, user_name: b.user_name, user_email: b.user_email, service_name: b.service_name } };
    } catch (err: any) {
        return { success: false, error_message: err.message };
    } finally {
        await client.end().catch(() => {});
    }
}

// --- CANCEL BOOKING ---
async function cancelBooking(payload: any) {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        const { booking_id, chat_id } = payload;
        
        // 1. Verificar que la reserva existe y pertenece al usuario
        const checkRes = await client.query('SELECT id, gcal_event_id, status FROM public.bookings WHERE id = $1 AND user_id = $2', [booking_id, chat_id]);
        if (checkRes.rows.length === 0) return { success: false, error_code: "NOT_FOUND", error_message: "Reserva no encontrada o no autorizada." };
        if (checkRes.rows[0].status === 'CANCELLED') return { success: false, error_code: "ALREADY_CANCELLED", error_message: "La reserva ya se encuentra cancelada." };

        // 2. Actualizar estado
        const updRes = await client.query('UPDATE public.bookings SET status = \'CANCELLED\', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, gcal_event_id', [booking_id]);
        
        return { 
            success: true, 
            data: { 
                booking_id: updRes.rows[0].id, 
                gcal_event_id: updRes.rows[0].gcal_event_id 
            },
            _meta: { source: "DAL_Proxy", timestamp: new Date().toISOString() }
        };
    } catch (err: any) {
        return { success: false, error_message: err.message };
    } finally {
        await client.end().catch(() => {});
    }
}

// --- GCAL SYNC (UPDATE ID) ---
async function updateGCalId(payload: any) {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        await client.query('UPDATE public.bookings SET gcal_event_id = $2 WHERE id = $1', [payload.booking_id, payload.gcal_event_id]);
        return { success: true };
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
app.post('/cancel-booking', async (req, res) => {
    const result = await cancelBooking(req.body);
    res.status(result.success ? 200 : 400).json(result);
});
app.post('/update-gcal', async (req, res) => res.json(await updateGCalId(req.body)));

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => console.log('🚀 Medical DAL Proxy Active'));
