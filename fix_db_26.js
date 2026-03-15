const axios = require('axios');
const fs = require('fs');
require('dotenv').config();
let apiKey = fs.readFileSync('.env', 'utf8').split('\n').find(l => l.startsWith('N8N_API_KEY=')).split('=')[1].replace(/['\"]/g, '');
const apiUrl = 'http://localhost:5678/api/v1';
const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };

const wf = {
  "name": "WF2_Booking_Orchestrator",
  "nodes": [
    {
      "parameters": {
        "path": "booking-orchestrator",
        "httpMethod": "POST",
        "responseMode": "lastNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [0, 0]
    },
    {
      "parameters": {
        "jsCode": "const input = $input.first().json;\nconst body = input.body || input;\nconst rawKey = `booking_${body.provider_id}_${body.service_id}_${body.start_time}_${body.customer_id || 'anon'}`;\nconst idempotency_key = rawKey.replace(/[^a-zA-Z0-9_:-]/g, '_').substring(0, 255);\nreturn [{ json: { ...body, idempotency_key } }];"
      },
      "name": "Validate & Prepare",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [250, 0]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT id as booking_id, status FROM bookings WHERE idempotency_key = $1::text LIMIT 1;",
        "options": { "queryReplacement": "={{ $json.idempotency_key }}" }
      },
      "name": "Check DB Idempotency",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [500, 0],
      "credentials": { "postgres": { "id": "SFNQsmuu4zirZAnP", "name": "Postgres account" } }
    },
    {
      "parameters": {
        "jsCode": "const items = $input.all();\nconst validated = $('Validate & Prepare').first().json;\nconst hasDup = items.length > 0 && items[0].json && items[0].json.booking_id;\nreturn [{ json: { ...validated, _is_duplicate: !!hasDup, _dup: hasDup ? items[0].json : null } }];"
      },
      "name": "Process Idempotency",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [750, 0]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            { "id": "dup", "leftValue": "={{ $json._is_duplicate }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }
          ],
          "combinator": "and"
        }
      },
      "name": "Is Duplicate?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [1000, 0]
    },
    {
      "parameters": {
        "jsCode": "const input = $input.first().json;\nreturn [{ json: {\n  success: true,\n  data: { ...input._dup, is_duplicate: true },\n  _meta: { source: 'WF2_Orchestrator', timestamp: new Date().toISOString() }\n}}];"
      },
      "name": "Return Duplicate SCO",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1250, 150]
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Validate & Prepare", "type": "main", "index": 0 }]] },
    "Validate & Prepare": { "main": [[{ "node": "Check DB Idempotency", "type": "main", "index": 0 }]] },
    "Check DB Idempotency": { "main": [[{ "node": "Process Idempotency", "type": "main", "index": 0 }], [{ "node": "Process Idempotency", "type": "main", "index": 0 }]] },
    "Process Idempotency": { "main": [[{ "node": "Is Duplicate?", "type": "main", "index": 0 }]] },
    "Is Duplicate?": { "main": [[{ "node": "Return Duplicate SCO", "type": "main", "index": 1 }], [{ "node": "Return Duplicate SCO", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
};

async function run() {
  try {
    const res = await axios.post(apiUrl + '/workflows', wf, { headers });
    console.log('Created Fresh OK', res.data.id);
    await axios.post(apiUrl + '/workflows/' + res.data.id + '/activate', {}, { headers });
  } catch (e) {
    console.error('Failed:', e.response?.data || e.message);
  }
}
run();
