// tests/rag_01_ingestion.test.ts
// RAG_01 Document Ingestion — Real webhook tests (ZERO MOCKS)
// Reference: GEMINI.md §2.9, §6

const BASE_URL = 'https://n8n.stax.ink/webhook/rag-ingest-document';
const TIMEOUT = 30000;

async function post(payload: Record<string, any>): Promise<any> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

describe('RAG_01 Document Ingestion', () => {
  // ── Happy Path ──────────────────────────────────────────────
  describe('Happy Path', () => {
    test('ingests minimal valid document', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Test Document Jest RAG01',
        content: 'This is a test document for Jest RAG_01 ingestion testing with enough characters.',
        source_type: 'faq',
        status: 'published',
        language: 'es',
      });
      expect(res.success).toBe(true);
      expect(res.data?.document_id).toBeDefined();
      expect(res.error_code).toBeNull();
    }, TIMEOUT);

    test('ingests document with service_id', async () => {
      const res = await post({
        provider_id: 1,
        service_id: 1,
        title: 'Test With Service ID RAG01',
        content: 'Document linked to a specific service for testing purposes in Jest RAG.',
        source_type: 'service',
      });
      expect(res.success).toBe(true);
      expect(res.data?.document_id).toBeDefined();
    }, TIMEOUT);

    test('ingests document with metadata', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Test With Metadata RAG01',
        content: 'Document with metadata attached for Jest testing of RAG_01 ingestion.',
        source_type: 'other',
        metadata: { test: true, jest_run: Date.now() },
      });
      expect(res.success).toBe(true);
    }, TIMEOUT);

    test('ingests document with explicit summary', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Test With Summary RAG01',
        content: 'Document with an explicit summary field provided in the payload.',
        summary: 'Short summary for Jest test',
        source_type: 'faq',
      });
      expect(res.success).toBe(true);
    }, TIMEOUT);

    test('source_type policy is accepted', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Policy Source Type Test RAG01',
        content: 'Testing that policy source type enum is correctly accepted by RAG_01.',
        source_type: 'policy',
      });
      expect(res.success).toBe(true);
    }, TIMEOUT);

    test('source_type emergency is accepted', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Emergency Source Type Test RAG01',
        content: 'Testing that emergency source type enum is correctly accepted.',
        source_type: 'emergency',
      });
      expect(res.success).toBe(true);
    }, TIMEOUT);
  });

  // ── Error Paths (Validation Sandwich) ──────────────────────
  describe('Error Paths', () => {
    test('rejects missing provider_id', async () => {
      const res = await post({
        title: 'No Provider ID Test',
        content: 'This should fail because provider_id is missing from the payload.',
      });
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('VALIDATION_ERROR');
    }, TIMEOUT);

    test('rejects invalid provider_id type', async () => {
      const res = await post({
        provider_id: 'not_a_number',
        title: 'Invalid Provider Type Test',
        content: 'This should fail because provider_id is a string not a number.',
      });
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('VALIDATION_ERROR');
    }, TIMEOUT);

    test('rejects missing title', async () => {
      const res = await post({
        provider_id: 1,
        content: 'Document without a title field present in the payload at all.',
      });
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('VALIDATION_ERROR');
    }, TIMEOUT);

    test('rejects title too short (<5 chars)', async () => {
      const res = await post({
        provider_id: 1,
        title: 'AB',
        content: 'Title is too short for the minimum character requirement.',
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);

    test('rejects missing content', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Missing Content Test RAG01',
      });
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('VALIDATION_ERROR');
    }, TIMEOUT);

    test('rejects content too short (<10 chars)', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Short Content Test RAG01',
        content: 'Short',
      });
      expect(res.success).toBe(false);
    }, TIMEOUT);

    test('normalizes invalid source_type to other', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Invalid Source Type Normalization Test',
        content: 'Testing that an invalid source_type gets normalized to other.',
        source_type: 'hacker_attempt',
      });
      // Should either succeed with normalized type or fail validation
      // Per our code: invalid source_types are normalized to 'other'
      expect(res.success).toBe(true);
    }, TIMEOUT);

    test('rejects invalid status enum', async () => {
      const res = await post({
        provider_id: 1,
        title: 'Invalid Status Enum Test RAG01',
        content: 'Testing that an invalid status value is properly rejected.',
        status: 'active_not_valid',
      });
      expect(res.success).toBe(false);
      expect(res.error_code).toBe('VALIDATION_ERROR');
    }, TIMEOUT);
  });
});
