/**
 * RAG_01 Document Ingestion - Post-Validate Embedding
 * Version: 1.7.4
 * 
 * Post-Validate Embedding (SEC02)
 * Validates OpenAI embedding response and merges with validated data
 */

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

interface ValidatedData {
  provider_id: number;
  service_id: number | null;
  title: string;
  content: string;
  source_type: string;
  status: string;
  language: string;
  metadata: Record<string, any>;
  summary: string;
  _meta: {
    source: string;
    timestamp: string;
    version: string;
  };
}

interface InputData {
  json?: ValidatedData;
}

interface EmbeddingInput {
  json?: EmbeddingResponse;
}

interface Output {
  json: ValidatedData & { embedding: number[] };
}

export function postValidateEmbedding(embeddingResponse: EmbeddingInput, validatedData: InputData): Output[] {
  const response = embeddingResponse.json;
  
  if (!response || !response.data || !Array.isArray(response.data) || response.data.length === 0) {
    throw new Error('EMBEDDING_ERROR: OpenAI returned empty or invalid response');
  }
  
  const embedding = response.data[0]?.embedding;
  
  if (!Array.isArray(embedding) || embedding.length !== 1536) {
    throw new Error('EMBEDDING_ERROR: Expected 1536 floats');
  }
  
  const validated = validatedData.json;
  
  return [{
    json: {
      ...validated,
      embedding
    }
  }];
}
