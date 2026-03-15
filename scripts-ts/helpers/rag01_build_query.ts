/**
 * RAG_01 Document Ingestion - Build Parameterized Query
 * Version: 1.7.4
 * 
 * O03 Postgres 4 Capas - BUILD
 * Builds parameterized INSERT query for rag_documents table
 */

interface DocumentData {
  provider_id: number;
  service_id: number | null;
  title: string;
  content: string;
  summary: string;
  embedding: number[];
  source_type: string;
  status: string;
  language: string;
  metadata: Record<string, any>;
}

interface Input {
  json?: DocumentData;
}

interface Output {
  json: {
    query: string;
  };
}

function escapeString(s: any, maxLen: number = 500): string {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''").substring(0, maxLen);
}

export function buildParameterizedQuery(input: Input): Output[] {
  const d = input.json;
  
  if (!d) {
    throw new Error('BUILD_ERROR: No input data provided');
  }

  const embeddingLiteral = `'[${d.embedding.join(',')}]'::vector(1536)`;
  const serviceIdLiteral = (d.service_id !== null) ? String(d.service_id) : 'NULL';
  const serviceIdCast = serviceIdLiteral !== 'NULL' ? '::bigint' : '';
  
  let metaJson = JSON.stringify(d.metadata || {});

  const query = `
INSERT INTO rag_documents (
  provider_id, service_id, title, content, summary, embedding, source_type, status, language, metadata
) VALUES (
  ${d.provider_id}::bigint,
  ${serviceIdLiteral}${serviceIdCast},
  '${escapeString(d.title)}'::text,
  '${escapeString(d.content, 50000)}'::text,
  '${escapeString(d.summary)}'::text,
  ${embeddingLiteral},
  '${escapeString(d.source_type)}'::rag_source_type,
  '${escapeString(d.status)}'::rag_document_status,
  '${escapeString(d.language, 10)}'::text,
  '${escapeString(metaJson, 10000)}'::jsonb
)
RETURNING id, provider_id, title, created_at;`.trim();

  return [{
    json: { query }
  }];
}
