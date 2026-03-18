import * as fs from 'fs';

const id = '6zftqMdtBAT0QaCt'; // WF3
const raw = fs.readFileSync('WF3_temp.json', 'utf-8');
const wf = JSON.parse(raw);

const node = wf.nodes.find(n => n.name === 'Validate Input');
if (node) {
  node.parameters.jsCode = `
// Availability Validation v2.2.0 - Strict Numeric Pattern
const input = $input.first().json;
const body = input.body || input;

// 1. Campos requeridos
const required = ['provider_id', 'service_id', 'start_time'];
for (const field of required) {
  if (!body[field]) {
    return [{ json: { _valid: false, _error: \`Missing required field: \${field}\` } }];
  }
}

// 2. Descomposición y Validación Numérica (Fix Feb 30, Year 9999)
const startTime = String(body.start_time);
const parts = startTime.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);

if (!parts) {
  return [{ json: { _valid: false, _error: 'Invalid start_time format: ISO 8601 required' } }];
}

const [full, y, m, d, hh, mm, ss] = parts.map(p => parseInt(p, 10));
const dateObj = new Date(startTime);

// 3. Verificación de "Fecha Real" (Evita Feb 30 -> Mar 2)
if (dateObj.getUTCFullYear() !== y || (dateObj.getUTCMonth() + 1) !== m || dateObj.getUTCDate() !== d) {
  return [{ json: { _valid: false, _error: 'The date provided does not exist in the calendar' } }];
}

const now = Date.now();
// 4. No permitir consultas excesivas al pasado (toleramos 1 hora por desfases de zona horaria)
if (dateObj.getTime() < (now - 3600000)) {
  return [{ json: { _valid: false, _error: 'Cannot query availability for the past' } }];
}

// 5. Horizonte Temporal (Máximo 1 año)
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
if (dateObj.getTime() > (now + ONE_YEAR_MS)) {
  return [{ json: { _valid: false, _error: 'Availability queries are limited to 1 year in advance' } }];
}

const duration_minutes = parseInt(body.duration_minutes || 60, 10);
const endDate = new Date(dateObj.getTime() + duration_minutes * 60000);

return [{ json: {
  _valid: true,
  provider_id: parseInt(body.provider_id, 10),
  service_id: parseInt(body.service_id, 10),
  start_time: startTime,
  end_time: endDate.toISOString(),
  duration_minutes: duration_minutes
}}];
  `;
}

fs.writeFileSync('WF3_patched.json', JSON.stringify(wf, null, 2));
console.log('Parche de validación estricta para WF3 preparado.');
