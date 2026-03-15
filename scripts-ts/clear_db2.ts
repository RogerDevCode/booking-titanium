import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

// Fix URL from .env in case it lacks a password
let dbUrl = process.env.DATABASE_URL || '';
if (dbUrl && !dbUrl.includes(':password@')) {
   // Let's rely on n8n_read_get or directly hitting n8n node 
   console.log('Cant clear directly without exact pass');
}
