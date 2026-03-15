import { Pool } from 'pg';
import { DateTime } from 'luxon';


// Initialize config (loads .env automatically)

const DATABASE_URL = process.env.DATABASE_URL || process.env.REMOTE_NEON_DB_URL;

async function getAvailability(provider_id: number, service_id: number, date: string) {
    const pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });

    try {
        
        // DateTime.fromISO(date).weekday returns 1 (Mon) to 7 (Sun)
        // PostgreSQL EXTRACT(DOW) returns 0 (Sun) to 6 (Sat)
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

        if (!dbData.config || !dbData.schedule) {
            return { success: true, data: { slots: [] }, message: "Provider not available or not working this day" };
        }

        const slots = [];
        const { duration_min, buffer_min, min_lead_booking_hours, name } = dbData.config;
        const { start_time, end_time } = dbData.schedule;
        const bookings = dbData.bookings || [];

        const bufferHours = min_lead_booking_hours !== undefined ? min_lead_booking_hours : 2;
        const nowWithBuffer = DateTime.now().setZone('utc').plus({ hours: bufferHours });

        // Parse with Luxon in UTC
        let current = DateTime.fromISO(`${date}T${start_time}`, { zone: 'utc' });
        const finish = DateTime.fromISO(`${date}T${end_time}`, { zone: 'utc' });

        while (current.plus({ minutes: duration_min }) <= finish) {
            const sStart = current;
            const sEnd = current.plus({ minutes: duration_min });

            const isBusy = bookings.some((b: { start_time: string, end_time: string }) => {
                const bStart = DateTime.fromISO(b.start_time, { zone: 'utc' });
                const bEnd = DateTime.fromISO(b.end_time, { zone: 'utc' });
                // Overlap check
                return (sStart < bEnd && sEnd > bStart);
            });

            const isFutureEnough = sStart >= nowWithBuffer;

            if (!isBusy && isFutureEnough) {
                slots.push({                    start_time: sStart.toISO(),
                    end_time: sEnd.toISO(),
                    display_time: sStart.toFormat('HH:mm')
                });
            }
            // Advance: duration + buffer
            current = sEnd.plus({ minutes: buffer_min });
        }

        return {
            success: true,
            data: { slots, provider_name: name, date },
            _meta: { source: "DAL_Service", timestamp: new Date().toISOString(), version: "1.0.0" }
        };

    } catch (err: unknown) {
        const error = err as Error;
        return { success: false, error_message: error.message };
    } finally {
        await pool.end();
    }
}

const [,, action, p1, p2, p3] = process.argv;

if (action === 'get_slots') {
    getAvailability(parseInt(p1), parseInt(p2), p3).then(res => console.log(JSON.stringify(res)));
}
