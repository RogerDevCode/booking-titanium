import express from 'express';
import { Pool } from 'pg';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { customAlphabet } from 'nanoid';

// Custom Alphanumeric Generator (Avoid confusing chars like 0/O, 1/L)
const generateShortCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);


dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    console.log(`[${req.method}] ${req.url} - BODY:`, JSON.stringify(req.body));
    next();
});

const dbConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, // Increased for serverless waking up
};

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// --- HELPER: Get Slots for a Specific Day ---
async function getSlotsForDay(provider_id: number, service_id: number, date: string) {
    const dt = DateTime.fromISO(date);
    const pg_dow = dt.weekday === 7 ? 0 : dt.weekday;

    const query = `
        SELECT 
            (SELECT row_to_json(conf) FROM (SELECT s.duration_min, s.buffer_min, s.min_lead_booking_hours, p.name FROM public.services s JOIN public.provider_services ps ON ps.service_id = s.id JOIN public.providers p ON p.id = ps.provider_id WHERE p.id = $1::integer AND s.id = $2::integer) conf) as config,
            (SELECT row_to_json(sch) FROM (SELECT start_time, end_time FROM public.provider_schedules WHERE provider_id = $1::integer AND day_of_week = $3::integer) sch) as schedule,
            (SELECT json_agg(bk) FROM (SELECT start_time, end_time FROM public.bookings WHERE provider_id = $1::integer AND status = 'CONFIRMED' AND start_time::date = $4::date) bk) as bookings;
    `;
    const res = await pool.query(query, [provider_id, service_id, pg_dow, date]);
    const dbData = res.rows[0];

    if (!dbData.config || !dbData.schedule) return [];

    const slots = [];
    const { duration_min, buffer_min, min_lead_booking_hours } = dbData.config;
    const { start_time, end_time } = dbData.schedule;
    const bookings = dbData.bookings || [];

    const tz = 'America/Santiago';
    const bufferHours = min_lead_booking_hours !== undefined ? min_lead_booking_hours : 2;
    const nowWithBuffer = DateTime.now().setZone(tz).plus({ hours: bufferHours });

    let current = DateTime.fromISO(`${date}T${start_time}`, { zone: tz });
    const finish = DateTime.fromISO(`${date}T${end_time}`, { zone: tz });

    while (current.plus({ minutes: duration_min }) <= finish) {
        const sStart = current;
        const sEnd = current.plus({ minutes: duration_min });
        
        const isBusy = bookings.some((b: any) => (sStart < DateTime.fromISO(b.end_time, { zone: tz }) && sEnd > DateTime.fromISO(b.start_time, { zone: tz })));
        const isFutureEnough = sStart >= nowWithBuffer;

        if (!isBusy && isFutureEnough) {
            slots.push({ 
                start_time: sStart.toISO(), 
                display_time: sStart.toFormat('HH:mm') 
            });
        }
        current = sEnd.plus({ minutes: buffer_min });
    }
    return slots;
}

// --- SMART LOOKUP ---
async function findFirstAvailable(provider_id: number, service_id: number, startDate: string) {
    
    try {
        const baseDt = DateTime.fromISO(startDate);
        const days = Array.from({ length: 7 }, (_, i) => baseDt.plus({ days: i }).toISODate()).filter((d): d is string => !!d);
        
        const results = await Promise.all(days.map(async (dateStr) => {
            const slots = await getSlotsForDay(provider_id, service_id, dateStr);
            return slots.length > 0 ? { date: dateStr, slots } : null;
        }));

        const firstHit = results.find(r => r !== null);
        if (firstHit) {
            return { success: true, date: firstHit.date, slots: firstHit.slots.slice(0, 5) };
        }
        return { success: true, date: null, slots: [], message: "No availability in the next 7 days" };
    } catch (err: unknown) {
        const error = err as Error;
        return { success: false, error_message: error.message };
    }
}

app.post('/availability', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const slots = await getSlotsForDay(req.body.provider_id, req.body.service_id, req.body.date);
        res.json({ success: true, data: { slots } });
    } catch (e: unknown) { res.status(500).json({ success: false }); }
});

app.post('/find-next-available', async (req: express.Request, res: express.Response): Promise<void> => {
    res.json(await findFirstAvailable(req.body.provider_id, req.body.service_id, req.body.date));
});

app.get('/providers', async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
        const result = await pool.query(`SELECT id, name FROM public.providers WHERE is_active = TRUE ORDER BY name ASC`);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_message: (e as Error).message });
    }
});

app.get('/services-by-provider/:provider_id', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { provider_id } = req.params;
        const query = `
            SELECT s.id, s.name, s.duration_min, s.buffer_min
            FROM public.services s
            JOIN public.provider_services ps ON s.id = ps.service_id
            WHERE ps.provider_id = $1::integer
            ORDER BY s.name ASC
        `;
        const result = await pool.query(query, [provider_id]);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_message: (e as Error).message });
    }
});

app.get('/providers-by-service/:service_id', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { service_id } = req.params;
        const query = `
            SELECT p.id, p.name
            FROM public.providers p
            JOIN public.provider_services ps ON p.id = ps.provider_id
            WHERE ps.service_id = $1::integer AND p.is_active = TRUE
            ORDER BY p.name ASC
        `;
        const result = await pool.query(query, [service_id]);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_message: (e as Error).message });
    }
});

// NEW: Endpoint to LIST bookings for a user
app.get('/user-bookings/:chat_id', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { chat_id } = req.params;
        const query = `
            SELECT b.short_code as booking_code, b.start_time, p.name as provider_name, s.name as service_name, b.status
            FROM public.bookings b
            JOIN public.providers p ON b.provider_id = p.id
            JOIN public.services s ON b.service_id = s.id
            WHERE b.user_id = $1::bigint AND b.status = 'CONFIRMED' AND b.start_time >= NOW()
            ORDER BY b.start_time ASC
        `;
        const result = await pool.query(query, [chat_id]);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_message: (e as Error).message });
    }
});

app.post('/create-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { chat_id, provider_id, service_id, start_time, user_email, user_name } = req.body;
        await pool.query(`INSERT INTO public.users (chat_id, email, full_name) VALUES ($1::bigint, $2::varchar, $3::varchar) ON CONFLICT (chat_id) DO UPDATE SET email = $2::varchar, full_name = $3::varchar`, [chat_id, user_email, user_name]);

        const overlapQuery = `SELECT 1 FROM public.bookings WHERE status = 'CONFIRMED' AND provider_id = $1::integer AND (start_time < ($2::timestamptz + interval '1 hour') AND end_time > $2::timestamptz) LIMIT 1`;
        const resOverlap = await pool.query(overlapQuery, [provider_id, start_time]);
        if (resOverlap.rows.length > 0) {
            res.json({ success: false, error_code: 'SLOT_OCCUPIED', error_message: 'El horario ya está reservado.' });
            return;
        }

        const shortCode = `BKG-${generateShortCode()}`;
        const query = `INSERT INTO public.bookings (provider_id, service_id, user_id, start_time, end_time, status, short_code) VALUES ($1::integer, $2::integer, $3::bigint, $4::timestamptz, $4::timestamptz + interval '1 hour', 'CONFIRMED', $5::varchar) RETURNING id, short_code;`;
        const resInsert = await pool.query(query, [provider_id, service_id, chat_id, start_time, shortCode]);

        res.json({ success: true, data: { booking_id: resInsert.rows[0].id, booking_code: resInsert.rows[0].short_code }, _meta: { source: "DAL_Create", timestamp: new Date().toISOString() } });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: (e as Error).message });
    }
});

app.post('/cancel-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { booking_id, chat_id } = req.body;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id);
        const whereClause = isUUID ? "id = $1::uuid" : "short_code = $1::varchar";

        const resCheck = await pool.query(`SELECT id, status FROM public.bookings WHERE ${whereClause} AND user_id = $2::bigint`, [booking_id, chat_id]);
        if (resCheck.rows.length === 0) {
            res.json({ success: false, error_code: 'NOT_FOUND', error_message: 'Reserva no encontrada.' });
            return;
        }
        if (resCheck.rows[0].status === 'CANCELLED') {
            res.json({ success: false, error_code: 'ALREADY_CANCELLED', error_message: 'La reserva ya estaba cancelada.' });
            return;
        }

        const realId = resCheck.rows[0].id;
        const resUpdate = await pool.query(`UPDATE public.bookings SET status = 'CANCELLED' WHERE id = $1::uuid AND user_id = $2::bigint RETURNING id, short_code;`, [realId, chat_id]);
        res.json({ success: true, data: { booking_id: resUpdate.rows[0].id, booking_code: resUpdate.rows[0].short_code }, _meta: { source: "DAL_Cancel", timestamp: new Date().toISOString() } });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: (e as Error).message });
    }
});

app.post('/reschedule-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { booking_id, chat_id, new_start_time, provider_id } = req.body;
        
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id);
        const whereClause = isUUID ? "id = $2::uuid" : "short_code = $2::varchar";

        const resOverlap = await pool.query(`SELECT 1 FROM public.bookings WHERE status = 'CONFIRMED' AND provider_id = $1::integer AND start_time < ($2::timestamptz + interval '1 hour') AND end_time > $2::timestamptz LIMIT 1`, [provider_id, new_start_time]);
        if (resOverlap.rows.length > 0) {
            res.json({ success: false, error_code: 'SLOT_OCCUPIED', error_message: 'El nuevo horario ya está reservado.' });
            return;
        }

        const resUpdate = await pool.query(`UPDATE public.bookings SET start_time = $1::timestamptz, end_time = $1::timestamptz + interval '1 hour' WHERE ${whereClause} AND user_id = $3::bigint RETURNING id, short_code;`, [new_start_time, booking_id, chat_id]);
        if (resUpdate.rows.length === 0) {
            res.json({ success: false, error_code: 'NOT_FOUND', error_message: 'Reserva no encontrada.' });
            return;
        }
        
        res.json({ success: true, data: { booking_id: resUpdate.rows[0].id, booking_code: resUpdate.rows[0].short_code }, _meta: { source: "DAL_Reschedule", timestamp: new Date().toISOString() } });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: (e as Error).message });
    }
});

app.get('/pending-reminders', async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
        const result = await pool.query(`SELECT b.id, b.user_id, b.start_time, p.name as provider_name, s.name as service_name, CASE WHEN b.reminder_1_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_1_hours) <= NOW() THEN 1 ELSE 2 END as reminder_type FROM public.bookings b JOIN public.providers p ON b.provider_id = p.id JOIN public.services s ON b.service_id = s.id WHERE b.status = 'CONFIRMED' AND ((b.reminder_1_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_1_hours) <= NOW()) OR (b.reminder_2_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_2_hours) <= NOW()))`);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) { res.status(500).json({ success: false, error_message: (e as Error).message }); }
});

app.post('/mark-reminder-sent', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        await pool.query(`UPDATE public.bookings SET ${req.body.type === 1 ? 'reminder_1_sent' : 'reminder_2_sent'} = TRUE WHERE id = $1::uuid`, [req.body.booking_id]);
        res.json({ success: true });
    } catch (e: unknown) { res.status(500).json({ success: false, error_message: (e as Error).message }); }
});

app.listen(3000, '0.0.0.0', () => console.log('🚀 Smart DAL Proxy Active'));
