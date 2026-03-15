const { Client } = require('pg');

const client = new Client({
  host: 'ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech',
  port: 5432,
  database: 'neondb',
  user: 'neondb_owner',
  password: 'npg_qxXSa8VnUo0i',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // Delete all bookings created by seed/load test scripts (user_id >= 9100000)
  const res = await client.query("DELETE FROM bookings WHERE user_id >= 9100000;");
  console.log('Deleted load test rows:', res.rowCount);
  
  await client.end();
}

run().catch(console.error);
