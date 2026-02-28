const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');

// Cargar env desde el subdirectorio si es necesario
dotenv.config({ path: 'scripts-ts/.env' });

async function setup() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Conectado a Neon DB');
        
        const sql = fs.readFileSync('schema_v2.sql', 'utf8');
        await client.query(sql);
        console.log('✅ Esquema y Semilla creados con éxito');
        
    } catch (err) {
        console.error('❌ Error configurando la base de datos:', err.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

setup();
