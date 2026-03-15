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
    const res = await axios.get(`${apiUrl}/workflows/bZjnsAc87FUU7Ytp`, { headers });
    let wf = res.data;

    // Fix Evaluate Idempotency logic
    const evalIdemp = wf.nodes.find(n => n.name === 'Evaluate Idempotency');
    if (evalIdemp) {
        evalIdemp.parameters.jsCode = "const items = $input.all();\nconst validated = $('Validate & Prepare').first().json;\nconst hasDup = items.length > 0 && items[0].json && items[0].json.booking_id;\nreturn [{ json: { ...validated, _is_duplicate: !!hasDup, _dup: hasDup ? items[0].json : null } }];";
    }

    // Fix Return Duplicate SCO logic
    const returnDup = wf.nodes.find(n => n.name === 'Return Duplicate SCO');
    if (returnDup) {
        returnDup.parameters.jsCode = "const input = $input.first().json;\nreturn [{ json: {\n  success: true,\n  data: { booking_id: input._dup.booking_id, status: input._dup.status, gcal_event_id: input._dup.gcal_event_id, is_duplicate: true },\n  _meta: { source: 'WF2_Orchestrator', timestamp: new Date().toISOString(), workflow_id: $workflow.id }\n}}];";
    }

    delete wf.id;
    delete wf.createdAt;
    delete wf.updatedAt;
    delete wf.tags;
    
    await axios.put(`${apiUrl}/workflows/bZjnsAc87FUU7Ytp`, wf, { headers });
    console.log('Successfully patched bZjnsAc87FUU7Ytp');
  } catch (e) {
    console.error('Failed:', e.response?.data || e.message);
  }
}
run();
