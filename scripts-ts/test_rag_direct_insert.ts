#!/usr/bin/env tsx
/**
 * Test Direct DB Insert - Skip OpenAI Embedding
 * Test RAG database insertion directly
 */

import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || process.env.REMOTE_NEON_DB_URL || '';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RAG Direct DB Insert Test                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  console.log(`📡 Database: ${DATABASE_URL.substring(0, 50)}...`);

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Test 1: Check table exists
    console.log('📋 Test 1: Check table exists...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'rag_documents'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ Table rag_documents exists\n');
    } else {
      console.log('❌ Table rag_documents NOT found\n');
      process.exit(1);
    }

    // Test 2: Insert document WITHOUT embedding (NULL)
    console.log('📋 Test 2: Insert document without embedding...');
    const testDoc = {
      provider_id: 1,
      service_id: null,
      title: 'Test Direct Insert - Servicios Médicos',
      content: 'La clínica ofrece servicios médicos de alta calidad con profesionales certificados.',
      summary: 'Descripción de servicios médicos',
      source_type: 'service',
      status: 'published',
      language: 'es',
      metadata: { test: true, source: 'direct_insert_test' }
    };

    const insertQuery = `
      INSERT INTO rag_documents (
        provider_id, service_id, title, content, summary,
        source_type, status, language, metadata, embedding
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL
      )
      RETURNING id, title, created_at;
    `;

    const result = await client.query(insertQuery, [
      testDoc.provider_id,
      testDoc.service_id,
      testDoc.title,
      testDoc.content,
      testDoc.summary,
      testDoc.source_type,
      testDoc.status,
      testDoc.language,
      JSON.stringify(testDoc.metadata)
    ]);

    console.log('✅ Document inserted successfully!');
    console.log(`   ID: ${result.rows[0].id}`);
    console.log(`   Title: ${result.rows[0].title}`);
    console.log(`   Created: ${result.rows[0].created_at}\n`);

    // Test 3: Query the document back
    console.log('📋 Test 3: Query document back...');
    const selectQuery = `
      SELECT id, title, provider_id, source_type, status, language, created_at
      FROM rag_documents
      WHERE metadata->>'test' = 'true'
      ORDER BY created_at DESC
      LIMIT 5;
    `;

    const docs = await client.query(selectQuery);
    console.log(`✅ Found ${docs.rows.length} test document(s):\n`);
    
    for (const doc of docs.rows) {
      console.log(`   - ${doc.title}`);
      console.log(`     ID: ${doc.id}, Provider: ${doc.provider_id}, Language: ${doc.language}\n`);
    }

    // Test 4: Count total documents
    console.log('📋 Test 4: Count total documents...');
    const countResult = await client.query('SELECT COUNT(*) FROM rag_documents');
    console.log(`   Total documents in rag_documents: ${countResult.rows[0].count}\n`);

    console.log('═'.repeat(64));
    console.log('✅ ALL TESTS PASSED!');
    console.log('   Database connection: OK');
    console.log('   Table structure: OK');
    console.log('   Insert: OK');
    console.log('   Query: OK');
    console.log('═'.repeat(64) + '\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.detail) console.error('   Detail:', error.detail);
    if (error.hint) console.error('   Hint:', error.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
