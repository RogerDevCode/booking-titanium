// tests/rag_02_retrieval.test.ts
// RAG_02 Document Retrieval — Real webhook tests (ZERO MOCKS)
// Reference: GEMINI.md §2.9, §6

const SEARCH_URL = 'https://n8n.stax.ink/webhook/rag-search';
const INGEST_URL = 'https://n8n.stax.ink/webhook/rag-ingest-document';
const TIMEOUT = 30000;

async function search(payload: Record<string, any>): Promise<any> {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function ingest(payload: Record<string, any>): Promise<any> {
  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

describe('RAG_02 Document Retrieval', () => {
  // Ensure at least one document exists before search tests
  beforeAll(async () => {
    await ingest({
      provider_id: 1,
      title: 'Jest RAG02 Prerequisite Document',
      content: 'This document exists to ensure RAG_02 search tests have at least one published document to find.',
      source_type: 'other',
    });
    // Wait for embedding + insert
    await new Promise(r => setTimeout(r, 3000));
  }, TIMEOUT);

  // ── Happy Path ──────────────────────────────────────────────
  describe('Happy Path', () => {
    test('search returns Standard Contract on valid query', async () => {
      const res = await search({
        query: 'document',
        provider_id: 1,
        limit: 5,
        similarity_threshold: 0.01,
      });
      expect(res.success).toBe(true);
      expect(res.error_code).toBeNull();
      expect(res.data).toBeDefined();
      expect(res.data?.documents).toBeDefined();
      expect(Array.isArray(res.data?.documents)).toBe(true);
      expect(res._meta?.source).toBe('RAG_02_Document_Retrieval');
    }, TIMEOUT);

    test('search returns documents with similarity scores', async () => {
      const res = await search({
        query: 'Jest RAG02 prerequisite',
        provider_id: 1,
        limit: 5,
        similarity_threshold: 0.01,
      });
      expect(res.success).toBe(true);
      if (res.data?.documents?.length > 0) {
        const doc = res.data.documents[0];
        expect(doc.similarity).toBeDefined();
        expect(typeof doc.similarity).toBe('number');
        expect(doc.similarity).toBeGreaterThanOrEqual(0);
        expect(doc.similarity).toBeLessThanOrEqual(1);
      }
    }, TIMEOUT);

    test('search respects limit parameter', async () => {
      const res = await search({
        query: 'document',
        provider_id: 1,
        limit: 1,
        similarity_threshold: 0.01,
      });
      expect(res.success).toBe(true);
      expect(res.data?.documents?.length).toBeLessThanOrEqual(1);
    }, TIMEOUT);

    test('search with high threshold returns fewer results', async () => {
      const resLow = await search({
        query: 'document test',
        provider_id: 1,
        limit: 10,
        similarity_threshold: 0.01,
      });
      const resHigh = await search({
        query: 'document test',
        provider_id: 1,
        limit: 10,
        similarity_threshold: 0.9,
      });
      expect(resLow.success).toBe(true);
      expect(resHigh.success).toBe(true);
      // High threshold should return same or fewer results
      expect(resHigh.data?.documents?.length).toBeLessThanOrEqual(
        resLow.data?.documents?.length ?? 0
      );
    }, TIMEOUT);

    test('search with non-existent query returns empty array, not error', async () => {
      const res = await search({
        query: 'xyznonexistent12345impossible',
        provider_id: 1,
        limit: 5,
        similarity_threshold: 0.01,
      });
      expect(res.success).toBe(true);
      expect(res.data?.documents).toBeDefined();
      // Empty results are valid — not an error
      expect(Array.isArray(res.data?.documents)).toBe(true);
    }, TIMEOUT);

    test('search returns documents with required fields', async () => {
      const res = await search({
        query: 'document',
        provider_id: 1,
        limit: 1,
        similarity_threshold: 0.01,
      });
      expect(res.success).toBe(true);
      if (res.data?.documents?.length > 0) {
        const doc = res.data.documents[0];
        expect(doc.id).toBeDefined();
        expect(doc.title).toBeDefined();
        expect(doc.content).toBeDefined();
        expect(doc.source_type).toBeDefined();
      }
    }, TIMEOUT);
  });

  // ── Error Paths ─────────────────────────────────────────────
  describe('Error Paths', () => {
    test('rejects missing query', async () => {
      const res = await search({
        provider_id: 1,
        limit: 5,
      });
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('VALIDATION_ERROR');
    }, TIMEOUT);

    test('rejects empty query', async () => {
      const res = await search({
        query: '',
        provider_id: 1,
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);

    test('rejects query too short (<2 chars)', async () => {
      const res = await search({
        query: 'X',
        provider_id: 1,
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);

    test('rejects missing provider_id', async () => {
      const res = await search({
        query: 'valid query text here',
      });
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('VALIDATION_ERROR');
    }, TIMEOUT);

    test('rejects invalid limit (0)', async () => {
      const res = await search({
        query: 'valid query',
        provider_id: 1,
        limit: 0,
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);

    test('rejects invalid limit (>20)', async () => {
      const res = await search({
        query: 'valid query',
        provider_id: 1,
        limit: 99,
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);

    test('rejects invalid threshold (negative)', async () => {
      const res = await search({
        query: 'valid query',
        provider_id: 1,
        similarity_threshold: -0.5,
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);

    test('rejects invalid threshold (>1)', async () => {
      const res = await search({
        query: 'valid query',
        provider_id: 1,
        similarity_threshold: 1.5,
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);
  });
});
