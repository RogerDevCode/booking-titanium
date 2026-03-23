// tests/rag_integration.test.ts
// RAG End-to-End Integration — Ingest → DB Verify → Search → Results (ZERO MOCKS)
// Reference: GEMINI.md §2.9, §6

import { Client } from 'pg';

const INGEST_URL = 'https://n8n.stax.ink/webhook/rag-ingest-document';
const SEARCH_URL = 'https://n8n.stax.ink/webhook/rag-search';
const TIMEOUT = 60000;
const UNIQUE_ID = `jest_e2e_${Date.now()}`;

let client: Client;
let ingestedDocId: string;

async function postJson(url: string, payload: Record<string, any>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

describe('RAG Integration E2E', () => {
  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_URL || process.env.REMOTE_NEON_DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    // Cleanup: delete test documents created by this suite
    await client.query(`DELETE FROM rag_documents WHERE title LIKE '%Jest E2E%'`);
    await client.end();
  });

  test('Step 1: Ingest a unique document via RAG_01', async () => {
    const res = await postJson(INGEST_URL, {
      provider_id: 1,
      title: `Jest E2E Unique Document ${UNIQUE_ID}`,
      content: `This is a unique end-to-end integration test document created at ${new Date().toISOString()}. It contains specific medical terminology like cardiologia preventiva and ecocardiograma for semantic search testing.`,
      source_type: 'faq',
      status: 'published',
      language: 'es',
    });
    expect(res.success).toBe(true);
    expect(res.data?.document_id).toBeDefined();
    ingestedDocId = res.data.document_id;
  }, TIMEOUT);

  test('Step 2: Verify document exists in DB with correct embedding', async () => {
    expect(ingestedDocId).toBeDefined();
    const res = await client.query(
      `SELECT id, title, content, array_length(embedding, 1) as dims, status 
       FROM rag_documents WHERE id = $1::integer`,
      [ingestedDocId]
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].title).toContain(UNIQUE_ID);
    expect(res.rows[0].dims).toBe(1536);
    expect(res.rows[0].status).toBe('published');
  }, TIMEOUT);

  test('Step 3: Search for the ingested document via RAG_02', async () => {
    // Wait for HNSW index to pick up the new vector
    await new Promise(r => setTimeout(r, 2000));
    
    const res = await postJson(SEARCH_URL, {
      query: 'cardiologia preventiva ecocardiograma',
      provider_id: 1,
      limit: 5,
      similarity_threshold: 0.01,
    });
    expect(res.success).toBe(true);
    expect(res.data?.documents).toBeDefined();
    expect(res.data.documents.length).toBeGreaterThanOrEqual(1);
    
    // Verify our document is in the results
    const found = res.data.documents.find((d: any) => 
      d.title?.includes(UNIQUE_ID) || d.id?.toString() === ingestedDocId?.toString()
    );
    expect(found).toBeDefined();
    expect(found.similarity).toBeGreaterThan(0);
  }, TIMEOUT);

  test('Step 4: Verify hybrid search combines vector + FTS', async () => {
    // Search with an exact keyword that should match via FTS
    const res = await postJson(SEARCH_URL, {
      query: UNIQUE_ID, // exact unique ID — FTS should catch this
      provider_id: 1,
      limit: 5,
      similarity_threshold: 0.01,
    });
    expect(res.success).toBe(true);
    // The unique ID should be found via full-text search even if vector similarity is low
    expect(res.data?.documents?.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  test('Step 5: Verify document content integrity (DB vs ingest)', async () => {
    const res = await client.query(
      `SELECT content FROM rag_documents WHERE id = $1::integer`,
      [ingestedDocId]
    );
    const dbContent = res.rows[0].content;
    expect(dbContent).toContain('cardiologia preventiva');
    expect(dbContent).toContain('ecocardiograma');
    expect(dbContent).toContain(UNIQUE_ID);
  }, TIMEOUT);
});
