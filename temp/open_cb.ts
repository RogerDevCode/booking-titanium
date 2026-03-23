import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
    const client = new Client({ connectionString: 'postgres://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require' });
    await client.connect();
    
    // Force circuit breaker open
    const res = await client.query(`
        INSERT INTO circuit_breaker_state (service_id, state, failure_count, failure_threshold) 
        VALUES ('google_calendar', 'open', 5, 5) 
        ON CONFLICT (service_id) 
        DO UPDATE SET state = 'open', failure_count = 5, opened_at = NOW();
    `);
    
    console.log('Circuit breaker set to OPEN for google_calendar.');
    await client.end();
}
main().catch(console.error);
