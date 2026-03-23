import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const sql = process.argv[process.argv.indexOf('--sql') + 1];
  if (!sql) {
    console.error('Usage: npx tsx scripts-ts/real_db_client.ts --sql "YOUR SQL"');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query(sql);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error('DB ERROR:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
