/**
 * RAG_01 Document Ingestion - Validate & Normalize
 * Version: 1.7.4
 * 
 * Validation Sandwich - PRE Validate (SEC02)
 * O03: Extract → Validate → Build | SEC04: Regex Whitelist
 * Unicode: Spanish + English via rangos \uXXXX explícitos
 */

interface RAGInput {
  provider_id?: any;
  service_id?: any;
  title?: any;
  content?: any;
  source_type?: any;
  status?: any;
  language?: any;
  metadata?: any;
  summary?: any;
  body?: any;
}

interface RAGOutput {
  json: {
    success: boolean;
    error_code: string | null;
    error_message: string | null;
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
  };
}

export function validateAndNormalize(input: RAGInput): RAGOutput[] {
  const data = input.body || input;

  // EXTRACT
  const provider_id = data.provider_id !== undefined ? Number(data.provider_id) : null;
  let service_id: number | null = null;
  if (data.service_id !== undefined && data.service_id !== null && data.service_id !== '') {
    service_id = Number(data.service_id);
  }

  const title = data.title !== undefined ? String(data.title).trim() : '';
  const content = data.content !== undefined ? String(data.content).trim() : '';
  const language = data.language !== undefined ? String(data.language).toLowerCase().trim() : 'es';
  const status = data.status !== undefined ? String(data.status).toLowerCase().trim() : 'published';

  // SEC04 - Regex Whitelist
  const safeStringRegex = /^[\w\s\- '".,?!():;$\/@&%+=*#\n\r\u00C0-\u017F¿¡]{1,500}$/u;
  const safeLongRegex = /^[\w\s\- '".,?!():;$\/@&%+=*#\n\r\[\]{}\u00C0-\u017F¿¡]{1,50000}$/u;
  const langRegex = /^[a-z]{2}$/;

  // Valid ENUMs
  const validSourceTypes = ['faq', 'policy', 'schedule', 'service', 'provider', 'insurance', 'pricing', 'preparation', 'post_care', 'emergency', 'other'];
  const validStatuses = ['published', 'draft', 'archived'];

  let source_type = data.source_type !== undefined ? String(data.source_type).toLowerCase().trim() : 'other';
  if (!validSourceTypes.includes(source_type)) source_type = 'other';

  if (!validStatuses.includes(status)) {
    throw new Error('VALIDATION_ERROR: status must be one of: ' + validStatuses.join(', '));
  }

  // VALIDATE
  const errors: string[] = [];

  if (!provider_id || provider_id <= 0 || !Number.isInteger(provider_id)) {
    errors.push('provider_id must be positive integer');
  }
  if (service_id !== null && (!Number.isInteger(service_id) || service_id <= 0 || isNaN(service_id))) {
    errors.push('service_id must be positive integer or omitted');
  }
  if (!title || title.length < 5) {
    errors.push('title too short (min 5 chars)');
  }
  if (title && !safeStringRegex.test(title)) {
    errors.push('title contains invalid characters');
  }
  if (!content || content.length < 10) {
    errors.push('content too short (min 10 chars)');
  }
  if (content && !safeLongRegex.test(content)) {
    errors.push('content contains invalid characters');
  }
  if (!langRegex.test(language)) {
    errors.push('language must be 2-char ISO code (e.g. es, en)');
  }

  if (errors.length > 0) {
    throw new Error('VALIDATION_ERROR: ' + errors.join(' | '));
  }

  let metadata: Record<string, any> = {};
  if (data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)) {
    metadata = data.metadata;
  }

  const summary = data.summary
    ? String(data.summary).substring(0, 500)
    : (content.length > 200 ? content.substring(0, 197) + '...' : content);

  return [{
    json: {
      success: true,
      error_code: null,
      error_message: null,
      provider_id,
      service_id,
      title,
      content,
      source_type,
      status,
      language,
      metadata,
      summary,
      _meta: {
        source: 'RAG_01_Document_Ingestion',
        timestamp: new Date().toISOString(),
        version: '1.7.4'
      }
    }
  }];
}
