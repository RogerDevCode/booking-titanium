import fs from 'fs';

const filePath = 'workflows/DB_Create_Booking.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

for (const node of data.nodes) {
  if (node.name === 'Format Response') {
    node.parameters.jsCode = `// UNIFIED OUTPUT — Standard Contract (§3.2)
// Final Safeguard: always return at least one item to webhook
let items = [];
try {
  items = $input.all();
} catch (e) {
  items = [];
}

const input = (items.length > 0 && items[0].json) ? items[0].json : {};

return [{ json: {
  success: input.success === true,
  error_code: input.error_code || (input.success === undefined ? 'EMPTY_RESPONSE' : null),
  error_message: input.error_message || (input.success === undefined ? 'No data received from upstream' : null),
  data: input.data || null,
  _meta: input._meta || {
    source: 'DB_Create_Booking',
    timestamp: new Date().toISOString(),
    workflow_id: $workflow.id
  }
}}];`;
  }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
