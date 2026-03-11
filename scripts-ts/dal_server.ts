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
    connectionTimeoutMillis: 15000,
};

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// --- HELPER: Audit Logging ---
async function logAudit(client: any, entity_type: string, entity_id: string, action: string, actor_id: string | number, old_values: any = null, new_values: any = null) {
    const query = `
        INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, old_values, new_values)
        VALUES ($1, $2, $3, $4::varchar, $5, $6)
    `;
    await client.query(query, [entity_type, entity_id, action, String(actor_id), old_values, new_values]);
}

// --- HELPER: Input Validation ---
// FIX P0-02: email vacío ('') ahora está explícitamente rechazado cuando se provee
function validateInput(name: string, email: string, requireEmail = false) {
    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s.]{2,100}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (name && !nameRegex.test(name)) throw new Error("Invalid name format. Only letters and spaces allowed.");
    if (requireEmail && (!email || email.trim() === '')) throw new Error("Email is required for booking.");
    if (email && email.trim() !== '' && !emailRegex.test(email.trim())) throw new Error("Invalid email format.");
}

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
            SELECT s.id, s.name, s.duration_min, s.buffer_min, s.price, s.currency
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

app.get('/user-bookings/:chat_id', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { chat_id } = req.params;
        const query = `
            SELECT b.short_code as booking_code, b.start_time, p.name as provider_name, s.name as service_name, b.status
            FROM public.bookings b
            JOIN public.providers p ON b.provider_id = p.id
            JOIN public.services s ON b.service_id = s.id
            WHERE b.user_id = $1::bigint AND b.status NOT IN ('CANCELLED', 'NO_SHOW') AND b.start_time >= NOW()
            ORDER BY b.start_time ASC
        `;
        const result = await pool.query(query, [chat_id]);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_message: (e as Error).message });
    }
});

app.get('/user/:chat_id', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { chat_id } = req.params;
        const query = `SELECT chat_id, email, full_name FROM public.users WHERE chat_id = $1::bigint`;
        const result = await pool.query(query, [chat_id]);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            // Fetch active bookings for this user
            const bookingsQuery = `
                SELECT b.short_code as booking_id, b.start_time, p.name as provider, s.name as service
                FROM public.bookings b
                JOIN public.providers p ON b.provider_id = p.id
                JOIN public.services s ON b.service_id = s.id
                WHERE b.user_id = $1::bigint AND b.status NOT IN ('CANCELLED', 'NO_SHOW') AND b.start_time >= NOW()
                ORDER BY b.start_time ASC
            `;
            const bookingsResult = await pool.query(bookingsQuery, [chat_id]);
            user.active_bookings = bookingsResult.rows;

            res.json({ success: true, registered: true, data: user });
        } else {
            res.json({ success: true, registered: false, data: null });
        }
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_message: (e as Error).message });
    }
});

app.post('/update-user', async (req: express.Request, res: express.Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { chat_id, email, full_name } = req.body;
        if (!chat_id) {
            res.status(400).json({ success: false, error_message: "chat_id is required" });
            return;
        }
        
        validateInput(full_name, email);

        await client.query('BEGIN');
        const oldRes = await client.query(`SELECT * FROM public.users WHERE chat_id = $1::bigint`, [chat_id]);
        const old_values = oldRes.rows.length > 0 ? oldRes.rows[0] : null;

        const query = `
            INSERT INTO public.users (chat_id, email, full_name) 
            VALUES ($1::bigint, $2::varchar, $3::varchar) 
            ON CONFLICT (chat_id) 
            DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name
            RETURNING *;
        `;
        const result = await client.query(query, [chat_id, email, full_name]);
        const new_values = result.rows[0];
        await logAudit(client, 'user', String(chat_id), old_values ? 'update' : 'create', chat_id, old_values, new_values);
        await client.query('COMMIT');
        res.json({ success: true, data: new_values });
    } catch (e: unknown) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error_message: (e as Error).message });
    } finally { client.release(); }
});

app.post('/create-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { chat_id, provider_id, service_id, start_time, user_email, user_name, reminders } = req.body;
        
        // FIX P0-01: Validar fecha futura con timezone explícito y buffer mínimo de 2h
        const TZ = 'America/Santiago';
        const startTimeDt = DateTime.fromISO(start_time, { zone: TZ });
        const nowWithBuffer = DateTime.now().setZone(TZ).plus({ hours: 2 });
        if (!startTimeDt.isValid || startTimeDt < nowWithBuffer) {
            res.status(400).json({ success: false, error_code: 'INVALID_DATE', error_message: "La reserva debe realizarse con al menos 2 horas de anticipación." });
            return;
        }

        // FIX P0-02: Validate inputs — requireEmail=true para crear citas
        validateInput(user_name, user_email, true);

        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text || $2::text)::bigint)`, [provider_id, start_time]);
        await client.query(`INSERT INTO public.users (chat_id, email, full_name) VALUES ($1::bigint, $2::varchar, $3::varchar) ON CONFLICT (chat_id) DO UPDATE SET email = $2::varchar, full_name = $3::varchar`, [chat_id, user_email, user_name]);

        const overlapQuery = `SELECT 1 FROM public.bookings WHERE status = 'CONFIRMED' AND provider_id = $1::integer AND (start_time < ($2::timestamptz + interval '1 hour') AND end_time > $2::timestamptz) LIMIT 1`;
        if ((await client.query(overlapQuery, [provider_id, start_time])).rows.length > 0) {
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'SLOT_OCCUPIED', error_message: 'El médico ya tiene un compromiso.' });
            return;
        }

        const userOverlapQuery = `SELECT 1 FROM public.bookings WHERE status = 'CONFIRMED' AND user_id = $1::bigint AND (start_time < ($2::timestamptz + interval '1 hour') AND end_time > $2::timestamptz) LIMIT 1`;
        if ((await client.query(userOverlapQuery, [chat_id, start_time])).rows.length > 0) {
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'USER_COLLISION', error_message: 'Ya tienes otra cita agendada para ese mismo horario.' });
            return;
        }

        const shortCode = `BKG-${generateShortCode()}`;
        const r = reminders || [24, 6, 1];
        const resInsert = await client.query(`INSERT INTO public.bookings (provider_id, service_id, user_id, start_time, end_time, status, short_code, reminder_1_hours, reminder_2_hours, reminder_3_hours) VALUES ($1, $2, $3, $4, $4::timestamptz + interval '1 hour', 'CONFIRMED', $5, $6, $7, $8) RETURNING *`, [provider_id, service_id, chat_id, start_time, shortCode, r[0], r[1], r[2]]);
        
        await logAudit(client, 'booking', resInsert.rows[0].id, 'create', chat_id, null, resInsert.rows[0]);
        await client.query('COMMIT');
        res.json({ success: true, data: { booking_id: resInsert.rows[0].id, booking_code: resInsert.rows[0].short_code } });
    } catch (e: unknown) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: (e as Error).message });
    } finally { client.release(); }
});

app.post('/cancel-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { booking_id, chat_id, reason } = req.body;
        console.log(`[DEBUG] /cancel-booking: ID=${booking_id}, User=${chat_id}`);
        // P1-02: Ensure robust ID handling
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id);
        const whereClause = isUUID ? "id = $1::uuid" : "short_code = $1::varchar";

        await client.query('BEGIN');
        const resCheck = await client.query(`SELECT id, status FROM public.bookings WHERE ${whereClause} AND user_id = $2::bigint`, [booking_id, chat_id]);
        
        if (resCheck.rows.length === 0) {
            console.log(`[DEBUG] /cancel-booking: Not found. Query: WHERE ${whereClause} AND user_id = $2::bigint Params: [${booking_id}, ${chat_id}]`);
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'NOT_FOUND', error_message: 'Reserva no encontrada.' });
            return;
        }
        
        const oldStatus = resCheck.rows[0].status;
        console.log(`[DEBUG] /cancel-booking: Found. Current status: ${oldStatus}`);
        if (oldStatus === 'CANCELLED') {
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'ALREADY_CANCELLED', error_message: 'La reserva ya estaba cancelada.' });
            return;
        }

        if (['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'].includes(oldStatus)) {
            console.log(`[DEBUG] /cancel-booking: Restricted. Status: ${oldStatus}`);
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'CANCELLATION_RESTRICTED', error_message: `No se puede cancelar una cita con estado ${oldStatus}.` });
            return;
        }

        const resUpdate = await client.query(`UPDATE public.bookings SET status = 'CANCELLED', status_reason = $2 WHERE id = $1::uuid RETURNING *;`, [resCheck.rows[0].id, reason || 'User cancellation']);
        console.log(`[DEBUG] /cancel-booking: Updated. New status: ${resUpdate.rows[0].status}`);
        await logAudit(client, 'booking', resCheck.rows[0].id, 'cancel', chat_id, { status: oldStatus }, { status: 'CANCELLED', reason });
        await client.query('COMMIT');
        res.json({ success: true, data: { booking_id: resUpdate.rows[0].id, booking_code: resUpdate.rows[0].short_code } });
    } catch (e: unknown) {
        console.error(`[DEBUG] /cancel-booking: Error: ${(e as Error).message}`);
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: (e as Error).message });
    } finally { client.release(); }
});

app.post('/reschedule-booking', async (req: express.Request, res: express.Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { booking_id, chat_id, new_start_time, provider_id } = req.body;
        
        // FIX P0-01: Validar fecha futura con timezone explícito y buffer mínimo de 2h
        const TZ_RESCHEDULE = 'America/Santiago';
        const newStartDt = DateTime.fromISO(new_start_time, { zone: TZ_RESCHEDULE });
        const nowWithBuffer2h = DateTime.now().setZone(TZ_RESCHEDULE).plus({ hours: 2 });
        if (!newStartDt.isValid || newStartDt < nowWithBuffer2h) {
            res.status(400).json({ success: false, error_code: 'INVALID_DATE', error_message: "La nueva fecha debe ser al menos 2 horas en el futuro." });
            return;
        }

        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text || $2::text)::bigint)`, [provider_id, new_start_time]);

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id);
        const whereClause = isUUID ? "id = $2::uuid" : "short_code = $2::varchar";

        if ((await client.query(`SELECT 1 FROM public.bookings WHERE status = 'CONFIRMED' AND provider_id = $1::integer AND start_time < ($2::timestamptz + interval '1 hour') AND end_time > $2::timestamptz LIMIT 1`, [provider_id, new_start_time])).rows.length > 0) {
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'SLOT_OCCUPIED', error_message: 'El médico ya tiene un compromiso.' });
            return;
        }

        const oldBooking = await client.query(`SELECT id, start_time, end_time FROM public.bookings WHERE ${whereClause} AND user_id = $3::bigint`, [new_start_time, booking_id, chat_id]);
        if (oldBooking.rows.length === 0) {
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'NOT_FOUND', error_message: 'Reserva no encontrada.' });
            return;
        }

        const resUpdate = await client.query(`UPDATE public.bookings SET start_time = $1, end_time = $1::timestamptz + interval '1 hour', reminder_1_sent = FALSE, reminder_2_sent = FALSE, reminder_3_sent = FALSE WHERE id = $2 RETURNING *;`, [new_start_time, oldBooking.rows[0].id]);
        await logAudit(client, 'booking', oldBooking.rows[0].id, 'reschedule', chat_id, oldBooking.rows[0], { start_time: new_start_time });
        await client.query('COMMIT');
        res.json({ success: true, data: { booking_id: resUpdate.rows[0].id, booking_code: resUpdate.rows[0].short_code } });
    } catch (e: unknown) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: (e as Error).message });
    } finally { client.release(); }
});

app.post('/update-booking-status', async (req: express.Request, res: express.Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { booking_id, status, reason, actor_id } = req.body;
        const validStatuses = ['CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'];
        if (!booking_id || !status || !validStatuses.includes(status)) {
            res.status(400).json({ success: false, error_message: "Valid booking_id and status required" });
            return;
        }
        await client.query('BEGIN');
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id);
        const whereClause = isUUID ? "id = $1::uuid" : "short_code = $1::varchar";

        const oldRes = await client.query(`SELECT id, status FROM public.bookings WHERE ${whereClause}`, [booking_id]);
        if (oldRes.rows.length === 0) {
            await client.query('ROLLBACK');
            res.json({ success: false, error_code: 'NOT_FOUND', error_message: 'Reserva no encontrada.' });
            return;
        }

        const result = await client.query(`UPDATE public.bookings SET status = $2, status_reason = $3 WHERE id = $1 RETURNING *;`, [oldRes.rows[0].id, status, reason]);
        await logAudit(client, 'booking', oldRes.rows[0].id, 'status_change', actor_id || 'system', { status: oldRes.rows[0].status }, { status, reason });
        await client.query('COMMIT');
        res.json({ success: true, data: result.rows[0] });
    } catch (e: unknown) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error_code: 'DB_ERROR', error_message: (e as Error).message });
    } finally { client.release(); }
});

app.post('/update-gcal-event-id', async (req: express.Request, res: express.Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { booking_id, gcal_event_id } = req.body;
        if (!booking_id || !gcal_event_id) {
            res.status(400).json({ success: false, error_message: "booking_id and gcal_event_id are required" });
            return;
        }

        await client.query('BEGIN');
        const result = await client.query(
            `UPDATE public.bookings SET gcal_event_id = $1 WHERE id = $2 RETURNING *;`,
            [gcal_event_id, booking_id]
        );
        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            res.json({ success: false, error_message: 'Booking not found' });
            return;
        }
        await client.query('COMMIT');
        res.json({ success: true, data: result.rows[0] });
    } catch (e: unknown) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error_message: (e as Error).message });
    } finally { client.release(); }
});

app.post('/update-reminders', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { booking_id, chat_id, reminders } = req.body;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(booking_id);
        const whereClause = isUUID ? "id = $4::uuid" : "short_code = $4::varchar";
        const r = reminders || [24, 6, 1];
        const result = await pool.query(`UPDATE public.bookings SET reminder_1_hours = $1, reminder_2_hours = $2, reminder_3_hours = $3, reminder_1_sent = FALSE, reminder_2_sent = FALSE, reminder_3_sent = FALSE WHERE ${whereClause} AND user_id = $5::bigint RETURNING *;`, [r[0], r[1], r[2], booking_id, chat_id]);
        if (result.rows.length === 0) {
            res.json({ success: false, error_code: 'NOT_FOUND', error_message: 'Reserva no encontrada.' });
            return;
        }
        await logAudit(pool, 'booking', result.rows[0].id, 'update_reminders', chat_id, null, { reminders: r });
        res.json({ success: true, data: result.rows[0] });
    } catch (e: unknown) { res.status(500).json({ success: false, error_message: (e as Error).message }); }
});

app.get('/audit-logs/:entity_type/:entity_id', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { entity_type, entity_id } = req.params;
        const query = `SELECT * FROM public.audit_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`;
        const result = await pool.query(query, [entity_type, entity_id]);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) { res.status(500).json({ success: false, error_message: (e as Error).message }); }
});

app.get('/pending-reminders', async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
        const query = `SELECT b.id, b.user_id, b.start_time, p.name as provider_name, s.name as service_name, CASE WHEN b.reminder_1_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_1_hours) <= NOW() THEN 1 WHEN b.reminder_2_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_2_hours) <= NOW() THEN 2 WHEN b.reminder_3_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_3_hours) <= NOW() THEN 3 ELSE 0 END as reminder_type FROM public.bookings b JOIN public.providers p ON b.provider_id = p.id JOIN public.services s ON b.service_id = s.id WHERE b.status = 'CONFIRMED' AND ((b.reminder_1_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_1_hours) <= NOW()) OR (b.reminder_2_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_2_hours) <= NOW()) OR (b.reminder_3_sent = FALSE AND (b.start_time - interval '1 hour' * b.reminder_3_hours) <= NOW()))`;
        const result = await pool.query(query);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) { res.status(500).json({ success: false, error_message: (e as Error).message }); }
});

app.post('/mark-reminder-sent', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const { booking_id, type } = req.body;
        const col = type === 1 ? 'reminder_1_sent' : (type === 2 ? 'reminder_2_sent' : 'reminder_3_sent');
        await pool.query(`UPDATE public.bookings SET ${col} = TRUE WHERE id = $1::uuid`, [booking_id]);
        res.json({ success: true });
    } catch (e: unknown) { res.status(500).json({ success: false, error_message: (e as Error).message }); }
});

// NEW: Endpoint to GET dashboard stats
app.get('/dashboard-stats', async (_req: express.Request, res: express.Response): Promise<void> => {
    try {
        const stats = await pool.query(`SELECT * FROM public.view_dashboard_stats`);
        const occupancy = await pool.query(`SELECT * FROM public.view_daily_occupancy ORDER BY date DESC LIMIT 30`);
        res.json({ success: true, data: { stats: stats.rows, occupancy: occupancy.rows } });
    } catch (e: unknown) {
        res.status(500).json({ success: false, error_message: (e as Error).message });
    }
});

// NEW: Endpoint to JOIN waitlist (P1-01 Fix: satisfy FK by upserting user)
app.post('/waitlist/join', async (req: express.Request, res: express.Response): Promise<void> => {
    const client = await pool.connect();
    try {
        const { chat_id, provider_id, service_id, preferred_date } = req.body;
        if (!chat_id || !provider_id || !service_id || !preferred_date) {
            res.status(400).json({ success: false, error_message: "Missing required fields" });
            return;
        }
        await client.query('BEGIN');
        // Satisfy foreign key
        await client.query(`INSERT INTO public.users (chat_id, full_name) VALUES ($1::bigint, 'Waitlist User') ON CONFLICT (chat_id) DO NOTHING`, [chat_id]);
        
        const query = `INSERT INTO public.waitlist (user_id, provider_id, service_id, preferred_date) VALUES ($1::bigint, $2::integer, $3::integer, $4::date) RETURNING id;`;
        const result = await client.query(query, [chat_id, provider_id, service_id, preferred_date]);
        await logAudit(client, 'waitlist', result.rows[0].id, 'join', chat_id, null, req.body);
        await client.query('COMMIT');
        res.json({ success: true, data: { waitlist_id: result.rows[0].id } });
    } catch (e: unknown) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error_message: (e as Error).message });
    } finally { client.release(); }
});

// NEW: Endpoint to FIND waitlist candidates
app.get('/waitlist/candidates/:booking_id', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        const booking_id = req.params.booking_id as string;
        const bRes = await pool.query(`SELECT provider_id, start_time::date as date FROM public.bookings WHERE id = $1::uuid`, [booking_id]);
        if (bRes.rows.length === 0) {
            res.json({ success: false, error_message: "Booking not found" });
            return;
        }
        const { provider_id, date } = bRes.rows[0];
        const result = await pool.query(`SELECT w.id, w.user_id, u.full_name FROM public.waitlist w JOIN public.users u ON w.user_id = u.chat_id WHERE w.provider_id = $1 AND w.preferred_date = $2 AND w.status = 'PENDING' ORDER BY w.created_at ASC LIMIT 5;`, [provider_id, date]);
        res.json({ success: true, data: result.rows });
    } catch (e: unknown) { res.status(500).json({ success: false, error_message: (e as Error).message }); }
});

app.listen(3000, '0.0.0.0', () => console.log('🚀 Smart DAL Proxy Active with Advisory Locks, 3-Level Reminders, Audit Logging, Waitlist & Stats (v1.5.3 — P0/P1 fixes)'));
