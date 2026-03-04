import express from 'express';
import { Pool } from 'pg';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
import * as path from 'path';

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
    connectionTimeoutMillis: 2000,
};

const pool = new Pool(dbConfig);

// --- HELPER: Get Slots for a Specific Day ---
async function getSlotsForDay(provider_id: number, service_id: number, date: string) {
    const dt = DateTime.fromISO(date);
    const pg_dow = dt.weekday === 7 ? 0 : dt.weekday;

    const query = `
        SELECT 
            (SELECT row_to_json(conf) FROM (SELECT s.duration_min, s.buffer_min, p.name FROM public.services s JOIN public.provider_services ps ON ps.service_id = s.id JOIN public.providers p ON p.id = ps.provider_id WHERE p.id = $1::integer AND s.id = $2::integer) conf) as config,
            (SELECT row_to_json(sch) FROM (SELECT start_time, end_time FROM public.provider_schedules WHERE provider_id = $1::integer AND day_of_week = $3::integer) sch) as schedule,
            (SELECT json_agg(bk) FROM (SELECT start_time, end_time FROM public.bookings WHERE provider_id = $1::integer AND status = 'CONFIRMED' AND start_time::date = $4::date) bk) as bookings;
    `;
    const res = await pool.query(query, [provider_id, service_id, pg_dow, date]);
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
    try {
        let currentDt = DateTime.fromISO(startDate);
        
        for (let i = 0; i < 7; i++) {
            const dateStr = currentDt.toISODate();
            if (!dateStr) continue;
            const slots = await getSlotsForDay(provider_id, service_id, dateStr);
            if (slots.length > 0) {
                return { success: true, date: dateStr, slots: slots.slice(0, 5) }; // Devolvemos max 5 opciones
            }
            currentDt = currentDt.plus({ days: 1 });
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
    } catch (e: unknown) { 
        res.status(500).json({ success: false }); 
    }
});

app.post('/find-next-available', async (req: express.Request, res: express.Response): Promise<void> => {
    res.json(await findFirstAvailable(req.body.provider_id, req.body.service_id, req.body.date));
});

// Endpoint to CREATE a booking
app.post('/create-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { chat_id, provider_id, service_id, start_time, user_email, user_name } = req.body;

        // Step 1: Ensure user exists (upsert)
        const userUpsertQuery = `
            INSERT INTO public.users (chat_id, email, full_name)
            VALUES ($1::bigint, $2::varchar, $3::varchar)
            ON CONFLICT (chat_id) DO UPDATE SET email = $2::varchar, full_name = $3::varchar
        `;
        await pool.query(userUpsertQuery, [chat_id, user_email, user_name]);

        // 2. Check overlap
        const overlapQuery = `
            SELECT 1 FROM public.bookings
            WHERE status = 'CONFIRMED'
            AND provider_id = $1::integer
            AND (
                start_time < ($2::timestamptz + interval '1 hour')
                AND end_time > $2::timestamptz
            )
            LIMIT 1
        `;
        const resOverlap = await pool.query(overlapQuery, [provider_id, start_time]);
        if (resOverlap.rows.length > 0) {
            res.json({ 
                success: false, 
                error_code: 'SLOT_OCCUPIED', 
                error_message: 'El horario ya está reservado.',
                _meta: { source: "DAL_Create", timestamp: new Date().toISOString() }
            });
            return;
        }

        // 3. Insert Booking (using chat_id for user_id)
        const query = `
            INSERT INTO public.bookings (provider_id, service_id, user_id, start_time, end_time, status)
            VALUES ($1::integer, $2::integer, $3::bigint, $4::timestamptz, $4::timestamptz + interval '1 hour', 'CONFIRMED')
            RETURNING id;
        `;
        const values = [provider_id, service_id, chat_id, start_time];
        const resInsert = await pool.query(query, values);

        res.json({ 
            success: true, 
            data: { booking_id: resInsert.rows[0].id },
            _meta: { source: "DAL_Create", timestamp: new Date().toISOString() }
        });
    } catch (e: unknown) {
        console.error("DB_ERROR in /create-booking:", e);
        const errorMsg = e instanceof Error ? e.message : String(e);
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: errorMsg });
    }
});

// Endpoint to CANCEL a booking
app.post('/cancel-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { booking_id, chat_id } = req.body;

        // Validate: check if exists and get status (using user_id = chat_id)
        const checkQuery = `SELECT status FROM public.bookings WHERE id = $1::uuid AND user_id = $2::bigint`;
        const resCheck = await pool.query(checkQuery, [booking_id, chat_id]);
        if (resCheck.rows.length === 0) {
            res.json({ 
                success: false, 
                error_code: 'NOT_FOUND', 
                error_message: 'Reserva no encontrada.',
                _meta: { source: "DAL_Cancel", timestamp: new Date().toISOString() }
            });
            return;
        }
        if (resCheck.rows[0].status === 'CANCELLED') {
            res.json({ 
                success: false, 
                error_code: 'ALREADY_CANCELLED', 
                error_message: 'La reserva ya estaba cancelada.',
                _meta: { source: "DAL_Cancel", timestamp: new Date().toISOString() }
            });
            return;
        }

        // Cancel
        const query = `
            UPDATE public.bookings SET status = 'CANCELLED'
            WHERE id = $1::uuid AND user_id = $2::bigint
            RETURNING id;
        `;
        const resUpdate = await pool.query(query, [booking_id, chat_id]);

        res.json({ 
            success: true, 
            data: { booking_id: resUpdate.rows[0].id },
            _meta: { source: "DAL_Cancel", timestamp: new Date().toISOString() }
        });
    } catch (e: unknown) {
        const error = e as Error;
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: error.message });
    }
});

// Endpoint to RESCHEDULE a booking
app.post('/reschedule-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { booking_id, chat_id, new_start_time, provider_id } = req.body;
        
        // Basic collision check
        const overlapQuery = `SELECT 1 FROM public.bookings WHERE status = 'CONFIRMED' AND provider_id = $1::integer AND start_time < ($2::timestamptz + interval '1 hour') AND end_time > $2::timestamptz LIMIT 1`;
        const resOverlap = await pool.query(overlapQuery, [provider_id, new_start_time]);
        if (resOverlap.rows.length > 0) {
            res.json({ 
                success: false, 
                error_code: 'SLOT_OCCUPIED', 
                error_message: 'El nuevo horario ya está reservado.',
                _meta: { source: "DAL_Reschedule", timestamp: new Date().toISOString() }
            });
            return;
        }

        // Update with user_id check
        const query = `UPDATE public.bookings SET start_time = $1::timestamptz, end_time = $1::timestamptz + interval '1 hour' WHERE id = $2::uuid AND user_id = $3::bigint RETURNING id;`;
        const resUpdate = await pool.query(query, [new_start_time, booking_id, chat_id]);
        if (resUpdate.rows.length === 0) {
            res.json({ 
                success: false, 
                error_code: 'NOT_FOUND',
                error_message: 'Reserva no encontrada.',
                _meta: { source: "DAL_Reschedule", timestamp: new Date().toISOString() }
            });
            return;
        }
        
        res.json({ 
            success: true, 
            data: { booking_id: resUpdate.rows[0].id },
            _meta: { source: "DAL_Reschedule", timestamp: new Date().toISOString() }
        });
    } catch (e: unknown) {
        const error = e as Error;
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: error.message });
    }
});

app.get('/pending-reminders', async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
        const query = `
            SELECT b.id, b.user_id, b.start_time, p.name as provider_name, s.name as service_name,
            CASE 
                WHEN b.reminder_1_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_1_hours) <= NOW() THEN 1
                ELSE 2
            END as reminder_type
            FROM public.bookings b
            JOIN public.providers p ON b.provider_id = p.id
            JOIN public.services s ON b.service_id = s.id
            WHERE b.status = 'CONFIRMED'
            AND (
                (b.reminder_1_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_1_hours) <= NOW())
                OR
                (b.reminder_2_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_2_hours) <= NOW())
            )
        `;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) {
        const error = e as Error;
        res.status(500).json({ success: false, error_message: error.message });
    }
});

app.post('/mark-reminder-sent', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { booking_id, type } = req.body;
        const column = type === 1 ? 'reminder_1_sent' : 'reminder_2_sent';
        const query = `UPDATE public.bookings SET ${column} = TRUE WHERE id = $1::uuid RETURNING id`;
        await pool.query(query, [booking_id]);
        res.json({ success: true });
    } catch (e: unknown) {
        const error = e as Error;
        res.status(500).json({ success: false, error_message: error.message });
    }
});

app.listen(3000, '0.0.0.0', () => console.log('🚀 Smart DAL Proxy Active'));
