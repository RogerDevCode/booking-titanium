// tests/rag_schema.test.ts
// RAG Database Schema Verification — Real DB tests (ZERO MOCKS)
// Reference: GEMINI.md §2.9, database/rag/01_verify_schema.sql

import { Client } from 'pg';

const TIMEOUT = 30000;
let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: process.env.DATABASE_URL || process.env.REMOTE_NEON_DB_URL });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe('RAG Database Schema', () => {
  test('pgvector extension is installed', async () => {
    const res = await client.query(`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`);
    expect(res.rows.length).toBe(1);
    expect(parseFloat(res.rows[0].extversion)).toBeGreaterThanOrEqual(0.7);
  }, TIMEOUT);

  test('rag_documents table exists', async () => {
    const res = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rag_documents'`);
    expect(res.rows.length).toBe(1);
  }, TIMEOUT);

  test('rag_documents has embedding vector(1536) column', async () => {
    const res = await client.query(`
      SELECT data_type, udt_name FROM information_schema.columns 
      WHERE table_name = 'rag_documents' AND column_name = 'embedding'
    `);
    expect(res.rows.length).toBe(1);
    // pgvector columns show as 'USER-DEFINED'
    expect(res.rows[0].data_type).toBe('USER-DEFINED');
  }, TIMEOUT);

  test('rag_source_type ENUM exists with expected values', async () => {
    const res = await client.query(`
      SELECT enumlabel FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'rag_source_type'
      ORDER BY enumlabel
    `);
    const labels = res.rows.map((r: any) => r.enumlabel);
    expect(labels).toContain('faq');
    expect(labels).toContain('policy');
    expect(labels).toContain('emergency');
  }, TIMEOUT);

  test('rag_document_status ENUM exists', async () => {
    const res = await client.query(`
      SELECT enumlabel FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'rag_document_status'
    `);
    const labels = res.rows.map((r: any) => r.enumlabel);
    expect(labels).toContain('published');
    expect(labels).toContain('draft');
    expect(labels).toContain('archived');
  }, TIMEOUT);

  test('hybrid_search_rag_documents function exists', async () => {
    const res = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'hybrid_search_rag_documents'
    `);
    expect(res.rows.length).toBe(1);
  }, TIMEOUT);

  test('search_rag_documents function exists', async () => {
    const res = await client.query(`
      SELECT routine_name FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name = 'search_rag_documents'
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  test('HNSW index exists on embedding column', async () => {
    const res = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes 
      WHERE tablename = 'rag_documents' AND indexdef LIKE '%hnsw%'
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  test('GIN index exists for full-text search', async () => {
    const res = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'rag_documents' AND indexdef LIKE '%gin%'
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  test('rag_documents has published documents', async () => {
    const res = await client.query(`SELECT COUNT(*) as cnt FROM rag_documents WHERE status = 'published'`);
    expect(parseInt(res.rows[0].cnt)).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  test('published documents have valid 1536-dim embeddings', async () => {
    const res = await client.query(`SELECT vector_dims(embedding) as dims FROM rag_documents WHERE status = 'published' LIMIT 1`);
    expect(res.rows[0].dims).toBe(1536);
  }, TIMEOUT);

  test('published documents have non-zero embeddings', async () => {
    const res = await client.query(`SELECT (embedding::real[])[1] as first_val FROM rag_documents WHERE status = 'published' LIMIT 1`);
    expect(res.rows[0].first_val).not.toBe(0);
  }, TIMEOUT);
});
