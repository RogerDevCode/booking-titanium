const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const envContent = fs.readFileSync('.env', 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '');
    break;
  }
}

const apiUrl = 'http://localhost:5678/api/v1';
const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };

async function run() {
  try {
    const res = await axios.get(`${apiUrl}/workflows/ZgiDJcBT61v43NvN`, { headers });
    let remoteWf = res.data;

    // Apply the necessary logic changes manually to the exact remote object structure
    
    // 1. Process Idempotency logic
    const processIdemp = remoteWf.nodes.find(n => n.name === 'Process Idempotency');
    if (processIdemp) {
      processIdemp.parameters.jsCode = `const items = $input.all();\nconst validated = $('Validate & Prepare').first().json;\n\n// 🚨 Check for DB error first\nif (items.length > 0 && items[0].json && items[0].json.message && !items[0].json.booking_id) {\n  return [{ json: { ...validated, _db_error: items[0].json.message, _is_duplicate: false } }];\n}\n\nconst hasDup = items.length > 0 && items[0].json && items[0].json.booking_id;\nreturn [{ json: { ...validated, _is_duplicate: !!hasDup, _dup: hasDup ? items[0].json : null } }];`;
    }

    // 2. Is Duplicate? node format
    const isDup = remoteWf.nodes.find(n => n.name === 'Is Duplicate?');
    if (isDup) {
      isDup.parameters.conditions = {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          { id: "is_dup", leftValue: "={{ $json._is_duplicate }}", rightValue: true, operator: { type: "boolean", operation: "equals" } }
        ],
        combinator: "and"
      };
    }

    // 3. Return Duplicate SCO context
    const returnDup = remoteWf.nodes.find(n => n.name === 'Return Duplicate SCO');
    if (returnDup) {
      returnDup.parameters.jsCode = `const input = $input.first().json;\nreturn [{ json: {\n  success: true,\n  data: { booking_id: input._dup.booking_id, status: input._dup.status, gcal_event_id: input._dup.gcal_event_id, is_duplicate: true },\n  _meta: { source: 'WF2_Orchestrator', timestamp: new Date().toISOString(), workflow_id: $workflow.id }\n}}];`;
    }

    // Delete non-updateable fields from top level object
    delete remoteWf.id;
    delete remoteWf.createdAt;
    delete remoteWf.updatedAt;
    delete remoteWf.tags;
    
    await axios.put(`${apiUrl}/workflows/ZgiDJcBT61v43NvN`, remoteWf, { headers });
    console.log('Successfully applied minimal patches.');

  } catch (e) {
    console.error('Failed to patch:', e.response?.data || e.message);
  }
}
run();
