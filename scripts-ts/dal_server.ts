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

// --- HELPER: Get Slots for a Specific Day ---
async function getSlotsForDay(client: Client, provider_id: number, service_id: number, date: string) {
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

    if (!dbData.config || !dbData.schedule) return [];

    const slots = [];
    const { duration_min, buffer_min } = dbData.config;
    const { start_time, end_time } = dbData.schedule;
    const bookings = dbData.bookings || [];

    let current = DateTime.fromISO(`${date}T${start_time}`, { zone: 'utc' });
    const finish = DateTime.fromISO(`${date}T${end_time}`, { zone: 'utc' });

    while (current.plus({ minutes: duration_min }) <= finish) {
        const sStart = current;
        const sEnd = current.plus({ minutes: duration_min });
        const isBusy = bookings.some((b: any) => (sStart < DateTime.fromISO(b.end_time, { zone: 'utc' }) && sEnd > DateTime.fromISO(b.start_time, { zone: 'utc' })));
        if (!isBusy) slots.push({ start_time: sStart.toISO(), display_time: sStart.toFormat('HH:mm') });
        current = sEnd.plus({ minutes: buffer_min });
    }
    return slots;
}

// --- SMART LOOKUP: Find First Available Day in 7 days ---
async function findFirstAvailable(provider_id: number, service_id: number, startDate: string) {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        let currentDt = DateTime.fromISO(startDate);
        
        for (let i = 0; i < 7; i++) {
            const dateStr = currentDt.toISODate();
            if (!dateStr) continue;
            const slots = await getSlotsForDay(client, provider_id, service_id, dateStr);
            if (slots.length > 0) {
                return { success: true, date: dateStr, slots: slots.slice(0, 5) }; // Devolvemos max 5 opciones
            }
            currentDt = currentDt.plus({ days: 1 });
        }
        return { success: true, date: null, slots: [], message: "No availability in the next 7 days" };
    } catch (err: any) {
        return { success: false, error_message: err.message };
    } finally {
        await client.end().catch(() => {});
    }
}

app.post('/get-slots', async (req, res) => {
    const client = new Client(dbConfig);
    try {
        await client.connect();
        const slots = await getSlotsForDay(client, req.body.provider_id, req.body.service_id, req.body.date);
        res.json({ success: true, data: { slots } });
    } catch (e: any) { res.status(500).json({ success: false }); } finally { await client.end(); }
});

app.post('/find-next-available', async (req, res) => {
    res.json(await findFirstAvailable(req.body.provider_id, req.body.service_id, req.body.date));
});

// [Endpoints de create, cancel, reschedule se mantienen igual]
app.post('/create-booking', async (req, res) => { /* ... */ res.json({success:true}); }); 

app.listen(3000, '0.0.0.0', () => console.log('🚀 Smart DAL Proxy Active'));
