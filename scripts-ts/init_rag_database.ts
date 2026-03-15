// scripts-ts/init_rag_database.ts
// Inicializa la base de datos RAG en Neon (tablas, índices, funciones)
// Ejecutar: npx tsx scripts-ts/init_rag_database.ts

import { N8NConfig } from './config';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Initialize config (loads .env automatically from project root)
const config = new N8NConfig();

const DATABASE_URL = process.env.DATABASE_URL || process.env.REMOTE_NEON_DB_URL || '';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  RAG Database Initialization - Neon PostgreSQL                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 Database: ${DATABASE_URL.substring(0, 40)}...`);
  console.log('\n' + '─'.repeat(64) + '\n');

  if (!DATABASE_URL || DATABASE_URL.includes('localhost')) {
    console.error('❌ ERROR: Configura DATABASE_URL en el .env raíz del proyecto');
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Conectado a Neon PostgreSQL\n');

    // Leer archivo SQL
    const sqlPath = path.join(__dirname, 'rag_init_db.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('📄 Ejecutando DDL (rag_init_db.sql)...');
    
    // Ejecutar statements separados por ;
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let executed = 0;
    for (const statement of statements) {
      try {
        await client.query(statement);
        executed++;
        
        // Log solo para statements importantes
        if (statement.includes('CREATE TABLE') || 
            statement.includes('CREATE INDEX') || 
            statement.includes('CREATE OR REPLACE FUNCTION')) {
          const match = statement.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|INDEX|FUNCTION)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
          if (match) {
            console.log(`   ✅ ${match[0].substring(0, 60)}...`);
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        // Ignorar errores de "ya existe"
        if (!errorMessage.includes('already exists') && 
            !errorMessage.includes('duplicate_object')) {
          console.error(`   ⚠️  Warning: ${errorMessage.substring(0, 80)}`);
        }
      }
    }

    console.log(`\n✅ ${executed} statements ejecutados\n`);

    // Verificar creación
    console.log('📋 Verificando instalación...\n');

    const tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' AND tablename LIKE 'rag%'
    `);
    console.log('   Tablas:', tables.rows.map(r => r.tablename).join(', ') || 'Ninguna');

    const types = await client.query(`
      SELECT typname FROM pg_type 
      WHERE typtype = 'e' AND typname LIKE 'rag%'
    `);
    console.log('   Tipos ENUM:', types.rows.map(r => r.typname).join(', ') || 'Ninguno');

    const functions = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name LIKE 'hybrid%'
    `);
    console.log('   Funciones:', functions.rows.map(r => r.routine_name).join(', ') || 'Ninguna');

    const extensions = await client.query(`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);
    console.log('   Extensiones:', extensions.rows.map(r => r.extname).join(', ') || 'Ninguna');

    console.log('\n' + '─'.repeat(64));
    console.log('🎉 ¡Base de datos RAG inicializada correctamente!\n');
    console.log('📝 Próximos pasos:');
    console.log('   1. Ejecutar: npx tsx scripts-ts/seed_rag_documents_direct.ts');
    console.log('   2. Testear webhook RAG_01 (si OpenAI credentials está configurado)');
    console.log('   3. Testear RAG_02_Document_Retrieval\n');

  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('💥 Error fatal:', errorMessage);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
