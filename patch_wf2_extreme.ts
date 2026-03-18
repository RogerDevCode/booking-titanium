import * as fs from 'fs';

const raw = fs.readFileSync('WF2_to_fix.json', 'utf-8');
const wf = JSON.parse(raw);

const node = wf.nodes.find(n => n.name === 'Generate Idempotency Key');
if (node) {
  node.parameters.jsCode = `
// Idempotency Check v2.3 - Extreme Sanitization & Robustness Pattern (Fix ATTACK 02, 03, 05)
try {
  const input = $input.first().json;
  const body = input.body || input;

  // 1. Sanitización de Campos y Tipos (Fix ATTACK-02 & ATTACK-05)
  const sanitizeInt = (val) => {
    if (Array.isArray(val)) val = val[0];
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const sanitizeStr = (val, maxLen = 255) => {
    if (Array.isArray(val)) val = val[0];
    if (typeof val !== 'string') val = String(val || '');
    // Remover caracteres peligrosos y truncar (Fix ATTACK-03)
    return val.replace(/[^\\w\\s@.-]/gi, '_').substring(0, maxLen);
  };

  const provider_id = sanitizeInt(body.provider_id);
  const service_id = sanitizeInt(body.service_id);
  const start_time = sanitizeStr(body.start_time, 50); 
  const user_name = sanitizeStr(body.user_name || body.name, 100);
  const chat_id = sanitizeStr(body.chat_id || body.customer_id, 50);

  // 2. Validación de Campos Requeridos
  if (!provider_id || !service_id || !start_time) {
    return [{ json: { success: false, error_code: 'INVALID_INPUT', error_message: 'Missing or invalid required fields' } }];
  }

  // 3. Validación de FECHA Estricta (Fix ATTACK-04)
  const parts = start_time.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);
  if (!parts) {
    return [{ json: { success: false, error_code: 'INVALID_DATE_FORMAT', error_message: 'Format must be ISO 8601' } }];
  }

  const [full, y, m, d] = parts.map(p => parseInt(p, 10));
  const dateObj = new Date(start_time);

  if (dateObj.getUTCFullYear() !== y || (dateObj.getUTCMonth() + 1) !== m || dateObj.getUTCDate() !== d) {
    return [{ json: { success: false, error_code: 'INVALID_DATE', error_message: 'Date does not exist' } }];
  }

  const now = Date.now();
  if (dateObj.getTime() < now) {
    return [{ json: { success: false, error_code: 'PAST_DATE', error_message: 'Cannot book in the past' } }];
  }

  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  if (dateObj.getTime() > (now + ONE_YEAR_MS)) {
    return [{ json: { success: false, error_code: 'FUTURE_DATE_TOO_EXTREME', error_message: 'Limit: 1 year' } }];
  }

  // 4. Generar idempotency_key Seguro
  const idempotencyKey = \`booking_\${provider_id}_\${service_id}_\${start_time}_\${chat_id || 'anon'}\`;
  const sanitizedKey = idempotencyKey.replace(/[^a-zA-Z0-9_:-]/g, '_').substring(0, 255);

  const ctx = {
    provider_id,
    service_id,
    start_time,
    user_name,
    chat_id,
    idempotency_key: sanitizedKey,
    _meta: { source: 'WF2_ORCHESTRATOR', version: '2.3.0', timestamp: new Date().toISOString() }
  };

  return [{ json: { success: true, ctx } }];

} catch (error) {
  // Global Catch (Option 2) - Prevents 500 errors
  return [{ json: { success: false, error_code: 'INTERNAL_ERROR', error_message: error.message } }];
}
  `;
}

const cleaned = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: { executionOrder: "v1", callerPolicy: "workflowsFromSameOwner", saveDataErrorExecution: "all", saveDataSuccessExecution: "all", saveExecutionProgress: true, saveManualExecutions: true }
};

fs.writeFileSync('WF2_extreme_security.json', JSON.stringify(cleaned, null, 2));
console.log('Blindaje de Seguridad Extrema (v2.3.0) preparado.');
