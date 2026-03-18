import * as fs from 'fs';

const raw = fs.readFileSync('WF2_to_fix.json', 'utf-8');
const wf = JSON.parse(raw);

const node = wf.nodes.find(n => n.name === 'Generate Idempotency Key');
if (node) {
  node.parameters.jsCode = `
// Idempotency Check v2.2 - Strict Numeric Validation Pattern
const input = $input.first().json;
const body = input.body || input;

// 1. Campos requeridos
const required = ['provider_id', 'service_id', 'start_time'];
for (const field of required) {
  if (!body[field]) {
    return [{ json: { success: false, error_code: 'MISSING_FIELD', error_message: \`Missing required field: \${field}\` } }];
  }
}

// 2. Validación Numérica y de Formato (Fix ATTACK-04)
const startTime = String(body.start_time);
const parts = startTime.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);

if (!parts) {
  return [{ json: { success: false, error_code: 'INVALID_DATE_FORMAT', error_message: 'Format must be ISO 8601 (YYYY-MM-DDTHH:mm:ss)' } }];
}

const [full, y, m, d, hh, mm, ss] = parts.map(p => parseInt(p, 10));
const dateObj = new Date(startTime);

// 3. Verificación de "Fecha Real" (Evita Feb 30 -> Mar 2)
if (dateObj.getUTCFullYear() !== y || (dateObj.getUTCMonth() + 1) !== m || dateObj.getUTCDate() !== d) {
  return [{ json: { success: false, error_code: 'INVALID_DATE', error_message: 'The date provided does not exist in the calendar' } }];
}

// 4. Comprobación de Fecha Pasada
const now = Date.now();
if (dateObj.getTime() < now) {
  return [{ json: { success: false, error_code: 'PAST_DATE', error_message: 'Cannot book in the past' } }];
}

// 5. Horizonte Temporal (Máximo 1 año a futuro)
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
if (dateObj.getTime() > (now + ONE_YEAR_MS)) {
  return [{ json: { success: false, error_code: 'FUTURE_DATE_TOO_EXTREME', error_message: 'Reservations are only allowed up to 1 year in advance' } }];
}

// 6. Generar idempotency_key
const idempotencyKey = \`booking_\${body.provider_id}_\${body.service_id}_\${body.start_time}_\${body.customer_id || body.chat_id || 'anonymous'}\`;
const sanitizedKey = idempotencyKey.replace(/[^a-zA-Z0-9_:-]/g, '_').substring(0, 255);

const ctx = {
  provider_id: parseInt(body.provider_id, 10),
  service_id: parseInt(body.service_id, 10),
  start_time: body.start_time,
  end_time: body.end_time || null,
  chat_id: body.chat_id || null,
  idempotency_key: sanitizedKey,
  _meta: { source: 'WF2_ORCHESTRATOR', version: '2.2.0', timestamp: new Date().toISOString() }
};

return [{ json: { success: true, ctx } }];
  `;
}

const cleaned = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: { executionOrder: "v1", callerPolicy: "workflowsFromSameOwner", saveDataErrorExecution: "all", saveDataSuccessExecution: "all", saveExecutionProgress: true, saveManualExecutions: true }
};

fs.writeFileSync('WF2_strict_val.json', JSON.stringify(cleaned, null, 2));
console.log('Parche de validación estricta (1 año) preparado.');
