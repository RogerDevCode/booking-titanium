const { Pool } = require('pg');

async function testLocal() {
  const pool = new Pool({ connectionString: 'postgres://n8n_user:n8n_secure_password_2026@localhost:5432/n8n_db_titanium' });
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Local DB success:', res.rows[0]);
  } catch (e) {
    console.error('Local DB fail:', e.message);
  } finally {
    pool.end();
  }
}

async function testNeon() {
  const pool = new Pool({
    connectionString: 'postgres://neondb_owner:npg_qxXSa8VnUo0i@ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech:5432/neondb?sslmode=require',
    ssl: { rejectUnauthorized: false }
  });
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('Neon DB success:', res.rows[0]);
  } catch (e) {
    console.error('Neon DB fail:', e.message);
  } finally {
    pool.end();
  }
}

Promise.all([testLocal(), testNeon()]);
