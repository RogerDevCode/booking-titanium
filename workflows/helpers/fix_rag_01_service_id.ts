import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'RAG_01_Document_Ingestion.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

for (const node of data.nodes) {
  if (node.name === 'Validate & Normalize' && node.type === 'n8n-nodes-base.code') {
    node.parameters.jsCode = `// Validation Sandwich - PRE Validate (SEC02)
// O03: Extract → Validate → Build | SEC04: Regex Whitelist
// Unicode: Spanish + English via rangos \\uXXXX explícitos (sin backticks en regex)

const input = $input.first()?.json.body || $input.first()?.json || {};

// EXTRACT
const provider_id  = input.provider_id  !== undefined ? Number(input.provider_id)  : null;
let service_id     = null;
if (input.service_id !== undefined && input.service_id !== null && input.service_id !== '') {
    service_id = Number(input.service_id);
}

const title        = input.title        !== undefined ? String(input.title).trim()  : '';
const content      = input.content      !== undefined ? String(input.content).trim(): '';
const language     = input.language     !== undefined ? String(input.language).toLowerCase().trim() : 'es';
const status       = input.status       !== undefined ? String(input.status).toLowerCase().trim()   : 'published';

// SEC04 - Regex Whitelist
// CRÍTICO: NO usar escapes inválidos (\\;, \\,, etc.) con flag /u, genera SyntaxError.
// Agregados ¿ ¡ para español y símbolos comunes ($ / @ & % + = * #)
const safeStringRegex = /^[\\w\\s\\-'".,?!():;$\\/@&%+=*#\\n\\r\\u00C0-\\u017F¿¡]{1,500}$/u;
const safeLongRegex   = /^[\\w\\s\\-'".,?!():;$\\/@&%+=*#\\n\\r\\[\\]{}\\u00C0-\\u017F¿¡]{1,50000}$/u;
const langRegex       = /^[a-z]{2}$/;

// Valid ENUMs
const validSourceTypes = ['faq','policy','schedule','service','provider','insurance','pricing','preparation','post_care','emergency','other'];
const validStatuses    = ['published','draft','archived'];

let source_type = input.source_type !== undefined ? String(input.source_type).toLowerCase().trim() : 'other';
if (!validSourceTypes.includes(source_type)) source_type = 'other';

if (!validStatuses.includes(status)) {
  throw new Error('VALIDATION_ERROR: status must be one of: ' + validStatuses.join(', '));
}

// VALIDATE
const errors = [];

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

let metadata = {};
if (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {
  metadata = input.metadata;
}

const summary = input.summary
  ? String(input.summary).substring(0, 500)
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
}];`;
  }
}

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('Fixed RAG_01 service_id parsing!');
