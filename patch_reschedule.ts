import * as fs from 'fs';

const id = 'F2F5oQ7okPDKwg9E'; // Reschedule
const raw = fs.readFileSync('WF_Reschedule.json', 'utf-8');
const wf = JSON.parse(raw);

// 1. Crear el nodo de validación estricta
const validateNode = {
  "parameters": {
    "jsCode": `
// Reschedule Validation v2.2.0 - Strict Numeric Pattern
const input = $input.first().json;
const body = input.body || input;

// 1. Campos requeridos para reschedule
const required = ['booking_id', 'new_start_time'];
for (const field of required) {
  if (!body[field]) {
    return [{ json: { success: false, error_code: 'MISSING_FIELD', error_message: \`Missing required field: \${field}\` } }];
  }
}

// 2. Validación de FECHA
const startTime = String(body.new_start_time);
const parts = startTime.match(/^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/);

if (!parts) {
  return [{ json: { success: false, error_code: 'INVALID_DATE_FORMAT', error_message: 'Format must be ISO 8601' } }];
}

const [full, y, m, d, hh, mm, ss] = parts.map(p => parseInt(p, 10));
const dateObj = new Date(startTime);

if (dateObj.getUTCFullYear() !== y || (dateObj.getUTCMonth() + 1) !== m || dateObj.getUTCDate() !== d) {
  return [{ json: { success: false, error_code: 'INVALID_DATE', error_message: 'The date provided does not exist in the calendar' } }];
}

const now = Date.now();
if (dateObj.getTime() < now) {
  return [{ json: { success: false, error_code: 'PAST_DATE', error_message: 'Cannot reschedule to the past' } }];
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
if (dateObj.getTime() > (now + ONE_YEAR_MS)) {
  return [{ json: { success: false, error_code: 'FUTURE_DATE_TOO_EXTREME', error_message: 'Rescheduling limited to 1 year in advance' } }];
}

return [{ json: { success: true, booking_id: body.booking_id, new_start_time: startTime } }];
`
  },
  "name": "Validate Reschedule Input",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [400, 300],
  "id": "reschedule-val-id"
};

// 2. Crear el nodo IF para bifurcar éxito/error
const ifNode = {
  "parameters": {
    "conditions": {
      "options": { "caseSensitive": true, "leftValue": "", "rightValue": "", "typeValidation": "strict" },
      "conditions": [
        {
          "id": "val_ok",
          "leftValue": "={{ $json.success }}",
          "rightValue": true,
          "operator": { "type": "boolean", "operation": "equals" }
        }
      ],
      "combinator": "and"
    }
  },
  "id": "if-reschedule-val-id",
  "name": "Validation OK?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.2,
  "position": [600, 300]
};

// 3. Crear nodo de respuesta de error
const errorResponseNode = {
  "parameters": {
    "jsCode": "return $input.all();"
  },
  "id": "reschedule-error-node",
  "name": "Error - Validation Failed",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [800, 500]
};

wf.nodes.push(validateNode, ifNode, errorResponseNode);

// 4. Re-conectar (Suponiendo que el webhook se llama "Webhook")
const webhookNode = wf.nodes.find(n => n.type === 'n8n-nodes-base.webhook');
if (webhookNode) {
  const nextNodes = wf.connections[webhookNode.name].main[0];
  wf.connections[webhookNode.name] = {
    "main": [ [ { "node": "Validate Reschedule Input", "type": "main", "index": 0 } ] ]
  };
  
  wf.connections["Validate Reschedule Input"] = {
    "main": [ [ { "node": "Validation OK?", "type": "main", "index": 0 } ] ]
  };

  wf.connections["Validation OK?"] = {
    "main": [
      nextNodes, // El flujo original va aquí (rama TRUE)
      [ { "node": "Error - Validation Failed", "type": "main", "index": 0 } ] // Rama FALSE
    ]
  };
}

fs.writeFileSync('WF_Reschedule_patched.json', JSON.stringify(wf, null, 2));
console.log('Parche estructural para Reschedule preparado.');
