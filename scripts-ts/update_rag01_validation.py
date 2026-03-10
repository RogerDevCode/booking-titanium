#!/usr/bin/env python3
"""
Update RAG_01 Validation - Replace regex with character whitelist
"""

import json

# Leer workflow
with open('workflows/RAG_01_Document_Ingestion.json', 'r', encoding='utf-8') as f:
    workflow = json.load(f)

# Buscar el nodo Validate & Normalize
validate_node = None
for node in workflow.get('nodes', []):
    if node.get('name') == 'Validate & Normalize':
        validate_node = node
        break

if not validate_node:
    print('❌ Node "Validate & Normalize" not found')
    exit(1)

print('✅ Found "Validate & Normalize" node')

# Nuevo código de validación (character whitelist, NO regex)
new_js_code = """// Validation Sandwich - PRE Validate (SEC02)
// O03: Extract → Validate → Build | SEC04: Character Whitelist (NO regex)
// Unicode support: Spanish (áéíóúüñ) + English + common symbols

const input = $input.first()?.json.body || $input.first()?.json || {};

// EXTRACT
const provider_id  = input.provider_id  !== undefined ? Number(input.provider_id)  : null;
const service_id   = input.service_id   !== undefined ? Number(input.service_id)   : null;
const title        = input.title        !== undefined ? String(input.title).trim()  : '';
const content      = input.content      !== undefined ? String(input.content).trim(): '';
const language     = input.language     !== undefined ? String(input.language).toLowerCase().trim() : 'es';
const status       = input.status       !== undefined ? String(input.status).toLowerCase().trim()   : 'published';

// SEC04 - Character Whitelist Validation (safer than regex)
const ALLOWED_CHARS = new Set([
  // Letters (basic Latin + Spanish)
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáéíóúüñÁÉÍÓÚÜÑ',
  // Numbers
  ...'0123456789',
  // Punctuation and symbols
  ...\\" .,?!:;()[]{}'\\"-–—/\\\\&@#$%*+=<>|~^_`´¨°¿¡«»‹›…•—–\\",
  // Whitespace
  '\\n', '\\r', '\\t', ' '
]);

// Validation function - check each character
function isValidText(text, maxLength = 50000) {
  if (typeof text !== 'string') return false;
  if (text.length === 0 || text.length > maxLength) return false;
  for (let i = 0; i < text.length; i++) {
    if (!ALLOWED_CHARS.has(text[i])) return false;
  }
  return true;
}

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
if (service_id !== null && (!Number.isInteger(service_id) || service_id <= 0)) {
  errors.push('service_id must be positive integer or omitted');
}
if (!title || title.length < 5) {
  errors.push('title too short (min 5 chars)');
}
if (title && !isValidText(title, 500)) {
  errors.push('title contains invalid characters or exceeds max length');
}
if (!content || content.length < 10) {
  errors.push('content too short (min 10 chars)');
}
if (content && !isValidText(content, 50000)) {
  errors.push('content contains invalid characters or exceeds max length');
}
if (!/^[a-z]{2}$/.test(language)) {
  errors.push('language must be 2-char ISO code (e.g. es, en)');
}

if (errors.length > 0) {
  throw new Error('VALIDATION_ERROR: ' + errors.join(' | '));
}

// Metadata: solo object plano
let metadata = {};
if (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {
  metadata = input.metadata;
}

// Summary: auto-generate if missing
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
      version: '1.7.0'
    }
  }
}];"""

# Actualizar el nodo
validate_node['parameters']['jsCode'] = new_js_code

# Guardar workflow
with open('workflows/RAG_01_Document_Ingestion.json', 'w', encoding='utf-8') as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)

print('✅ Validation code updated to use character whitelist (NO regex)')
print('   Version updated to 1.7.0')
print('   File saved: workflows/RAG_01_Document_Ingestion.json')
