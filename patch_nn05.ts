import * as fs from 'fs';

const id = 'trmFIo0zClyF38L8'; // NN_05
const raw = fs.readFileSync('NN_05_Reminder_Cron.json', 'utf-8');
const wf = JSON.parse(raw);

const node = wf.nodes.find(n => n.name === 'Prepare Reminder');
if (node) {
  node.parameters.jsCode = `
// Reminder Preparation v2.2.0 - Strict Formatting
const input = $input.first().json;
const startRaw = String(input.start_time || '');

// 1. Validación de Formato ISO y Existencia
const parts = startRaw.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);
if (!parts) {
  return [{ json: { _error: true, _msg: 'Invalid start_time format in DB' } }];
}

const dateObj = new Date(startRaw);
const [full, y, m, d] = parts.map(p => parseInt(p, 10));

// 2. Verificación de Fecha Real (Anti Feb 30)
if (dateObj.getUTCFullYear() !== y || (dateObj.getUTCMonth() + 1) !== m || dateObj.getUTCDate() !== d) {
  return [{ json: { _error: true, _msg: 'Non-existent date in DB' } }];
}

// 3. Horizonte de Seguridad (No procesar nada a más de 1 año o muy en el pasado)
const now = Date.now();
const diff = dateObj.getTime() - now;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

if (Math.abs(diff) > ONE_YEAR_MS) {
  return [{ json: { _error: true, _msg: 'Temporal anomaly: Date too far in future/past' } }];
}

// 4. Formateo Seguro (es-AR)
let timeDisplay = '';
try {
  timeDisplay = dateObj.toLocaleString('es-AR', { 
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false 
  });
} catch(e) {
  timeDisplay = startRaw; // Fallback
}

const service = input.service_name || 'Cita';
const provider = input.provider_name || 'Profesional';
const chat_id = String(input.chat_id || input.user_id || '');

if (!chat_id) {
  return [{ json: { _error: true, _msg: 'Missing chat_id for reminder' } }];
}

return [{
  json: {
    chat_id,
    text: \`⏰ Recordatorio: Tienes una cita de \${service} con \${provider} — \${timeDisplay}\`,
    booking_id: input.id || '',
    success: true,
    _meta: { timestamp: new Date().toISOString() }
  }
}];
  `;
}

fs.writeFileSync('NN_05_patched.json', JSON.stringify(wf, null, 2));
console.log('Parche de recordatorios (NN_05) preparado.');
