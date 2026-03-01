import { Client } from 'pg';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function getAvailability(provider_id: number, service_id: number, date: string) {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        
        // DateTime.fromISO(date).weekday returns 1 (Mon) to 7 (Sun)
        // PostgreSQL EXTRACT(DOW) returns 0 (Sun) to 6 (Sat)
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

        if (!dbData.config || !dbData.schedule) {
            return { success: true, data: { slots: [] }, message: "Provider not available or not working this day" };
        }

        const slots = [];
        const { duration_min, buffer_min, name } = dbData.config;
        const { start_time, end_time } = dbData.schedule;
        const bookings = dbData.bookings || [];

        // Parse with Luxon in UTC
        let current = DateTime.fromISO(`${date}T${start_time}`, { zone: 'utc' });
        const finish = DateTime.fromISO(`${date}T${end_time}`, { zone: 'utc' });

        while (current.plus({ minutes: duration_min }) <= finish) {
            const sStart = current;
            const sEnd = current.plus({ minutes: duration_min });
            
            const isBusy = bookings.some((b: any) => {
                const bStart = DateTime.fromISO(b.start_time, { zone: 'utc' });
                const bEnd = DateTime.fromISO(b.end_time, { zone: 'utc' });
                // Overlap check
                return (sStart < bEnd && sEnd > bStart);
            });

            if (!isBusy) {
                slots.push({
                    start_time: sStart.toISO(),
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

    } catch (err: any) {
        return { success: false, error_message: err.message };
    } finally {
        await client.end();
    }
}

const [,, action, p1, p2, p3] = process.argv;

if (action === 'get_slots') {
    getAvailability(parseInt(p1), parseInt(p2), p3).then(res => console.log(JSON.stringify(res)));
}
