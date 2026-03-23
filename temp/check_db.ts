import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const client = new Client({ connectionString: 'postgres://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require' });
    await client.connect();
    
    console.log("--- BOOKINGS ---");
    const res = await client.query(`SELECT id, start_time, gcal_event_id, status FROM bookings ORDER BY created_at DESC LIMIT 3`);
    console.log(JSON.stringify(res.rows, null, 2));

    console.log("--- DLQ ENTRIES ---");
    const dlq = await client.query(`SELECT provider_id, service_id, status FROM booking_dlq ORDER BY created_at DESC LIMIT 3`);
    console.log(JSON.stringify(dlq.rows, null, 2));
    
    // Also check circuit breaker state just to be sure
    const cb = await client.query(`SELECT service_id, state FROM circuit_breaker_state WHERE service_id='google_calendar'`);
    console.log("--- CB STATE ---");
    console.log(cb.rows);

    await client.end();
}
main().catch(console.error);
