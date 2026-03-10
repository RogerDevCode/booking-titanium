import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  console.log("Conectado a la base de datos...");
  const res = await client.query('TRUNCATE TABLE rag_documents RESTART IDENTITY;');
  console.log("Tabla rag_documents truncada exitosamente.");
  
  await client.end();
}
run();
