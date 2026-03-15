const fs = require('fs');

const wf = {
  "name": "WF2_Booking_Orchestrator",
  "nodes": [
    {
      "parameters": {
        "path": "booking-orchestrator",
        "httpMethod": "POST",
        "responseMode": "lastNode"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [0, 0],
      "webhookId": "booking-orchestrator"
    },
    {
      "parameters": {
        "jsCode": `
const body = $input.first().json.body || $input.first().json;
const provider_id = parseInt(body.provider_id, 10);
const service_id = parseInt(body.service_id, 10);
const start_time = body.start_time;

if (isNaN(provider_id) || isNaN(service_id) || !start_time) {
  throw new Error('Invalid input data');
}

const cleanTime = String(start_time).replace(/[^0-9]/g, '');
const idempotency_key = \`booking_\${provider_id}_\${service_id}_\${cleanTime}_\${body.customer_id || body.chat_id || 'anon'}\`;

return [{ json: {
  provider_id, service_id, start_time, 
  idempotency_key,
  event_title: body.event_title || 'Appointment',
  customer_id: body.customer_id || null,
  chat_id: body.chat_id || null
}}];`
      },
      "name": "Validate",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [200, 0]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT id, status, gcal_event_id FROM bookings WHERE idempotency_key = $1 LIMIT 1;",
        "options": { "queryReplacement": "={{ $json.idempotency_key }}" }
      },
      "name": "Idemp Check",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [400, 0],
      "credentials": { "postgres": { "id": "SFNQsmuu4zirZAnP", "name": "Postgres account" } },
      "alwaysOutputData": true
    },
    {
      "parameters": {
        "jsCode": `
const items = $input.all();
const val = $('Validate').first().json;
const dup = (items.length > 0 && items[0].json.id) ? items[0].json : null;
return [{ json: { ...val, _is_dup: !!dup, _dup: dup } }];`
      },
      "name": "Process Idemp",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [600, 0]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            { "id": "dup", "leftValue": "={{ $json._is_dup }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }
          ],
          "combinator": "and"
        }
      },
      "name": "Is Duplicate?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [800, 0]
    },
    {
      "parameters": {
        "jsCode": `
const d = $input.first().json._dup;
return [{ json: {
  success: true,
  data: { booking_id: d.id, status: d.status, gcal_event_id: d.gcal_event_id, is_duplicate: true },
  _meta: { source: 'WF2' }
}}];`
      },
      "name": "Duplicate Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1000, 100]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/acquire-lock",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ provider_id: $json.provider_id, start_time: $json.start_time }) }}",
        "options": { "includeInputData": true }
      },
      "name": "Lock HTTP",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [1000, -100],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const res = $input.first().json;
const val = $('Process Idemp').first().json;
const ok = res.data?.acquired === true;
return [{ json: { 
  ...val, 
  _lock_ok: ok, 
  _lock_key: res.data?.lock_key, 
  _owner_token: res.data?.owner_token,
  _lock_err: res.error || (res.success === false ? res.error_message : null)
}}];`
      },
      "name": "Process Lock",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1200, -100]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            { "id": "lock", "leftValue": "={{ $json._lock_ok }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }
          ],
          "combinator": "and"
        }
      },
      "name": "Lock OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [1400, -100]
    },
    {
      "parameters": {
        "jsCode": `
return [{ json: {
  success: false, error_code: 'LOCK_DENIED',
  _meta: { source: 'WF2' }
}}];`
      },
      "name": "Lock Denied Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1600, 0]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/check-availability",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ provider_id: $json.provider_id, service_id: $json.service_id, start_time: $json.start_time }) }}",
        "options": { "includeInputData": true }
      },
      "name": "Avail HTTP",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [1600, -200],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const res = $input.first().json;
const ctx = $('Process Lock').first().json;
const avail = res.data?.available === true;
return [{ json: { ...ctx, _avail_ok: avail, _avail_err: res.error || null } }];`
      },
      "name": "Process Avail",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1800, -200]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [
            { "id": "av", "leftValue": "={{ $json._avail_ok }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }
          ],
          "combinator": "and"
        }
      },
      "name": "Avail OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [2000, -200]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/release-lock",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ lock_key: $json._lock_key, owner_token: $json._owner_token }) }}",
        "options": {}
      },
      "name": "Release Lock Fail",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [2200, -100],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const ctx = $('Process Avail').first().json;
return [{ json: {
  success: false, error_code: ctx._avail_err ? 'AVAIL_FAIL' : 'NOT_AVAILABLE',
  _meta: { source: 'WF2' }
}}];`
      },
      "name": "Fail Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2400, -100]
    },
    {
      "parameters": {
        "jsCode": `
const val = $('Process Avail').first().json;
// Mock GCal Success for now to test the plumbing
return [{ json: { ...val, _gcal_id: 'gcal_123', _gcal_ok: true } }];`
      },
      "name": "MOCK GCal Success",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2200, -300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "INSERT INTO bookings (provider_id, service_id, start_time, idempotency_key, gcal_event_id, status) VALUES ($1, $2, $3, $4, $5, 'CONFIRMED') RETURNING id;",
        "options": {
          "queryReplacement": "={{ $json.provider_id }}, {{ $json.service_id }}, {{ $json.start_time }}, {{ $json.idempotency_key }}, {{ $json._gcal_id }}"
        }
      },
      "name": "DB Insert",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [2400, -300],
      "credentials": { "postgres": { "id": "SFNQsmuu4zirZAnP", "name": "Postgres account" } },
      "alwaysOutputData": true,
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const res = $input.first().json;
const ctx = $('MOCK GCal Success').first().json;
const ok = !!res.id;
return [{ json: { ...ctx, _db_id: res.id, _db_ok: ok } }];`
      },
      "name": "Process DB",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2600, -300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/release-lock",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ lock_key: $json._lock_key, owner_token: $json._owner_token }) }}",
        "options": {}
      },
      "name": "Release Lock Success",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [2800, -300]
    },
    {
      "parameters": {
        "jsCode": `
const ctx = $('Process DB').first().json;
return [{ json: {
  success: true,
  data: { booking_id: ctx._db_id, gcal_id: ctx._gcal_id },
  _meta: { source: 'WF2' }
}}];`
      },
      "name": "Success Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [3000, -300]
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Validate", "type": "main", "index": 0 }]] },
    "Validate": { "main": [[{ "node": "Idemp Check", "type": "main", "index": 0 }]] },
    "Idemp Check": { "main": [[{ "node": "Process Idemp", "type": "main", "index": 0 }]] },
    "Process Idemp": { "main": [[{ "node": "Is Duplicate?", "type": "main", "index": 0 }]] },
    "Is Duplicate?": { "main": [
      [{ "node": "Duplicate Response", "type": "main", "index": 0 }],
      [{ "node": "Lock HTTP", "type": "main", "index": 0 }]
    ]},
    "Lock HTTP": { "main": [[{ "node": "Process Lock", "type": "main", "index": 0 }], [{ "node": "Process Lock", "type": "main", "index": 0 }]] },
    "Process Lock": { "main": [[{ "node": "Lock OK?", "type": "main", "index": 0 }]] },
    "Lock OK?": { "main": [
      [{ "node": "Avail HTTP", "type": "main", "index": 0 }],
      [{ "node": "Lock Denied Response", "type": "main", "index": 0 }]
    ]},
    "Avail HTTP": { "main": [[{ "node": "Process Avail", "type": "main", "index": 0 }], [{ "node": "Process Avail", "type": "main", "index": 0 }]] },
    "Process Avail": { "main": [[{ "node": "Avail OK?", "type": "main", "index": 0 }]] },
    "Avail OK?": { "main": [
      [{ "node": "MOCK GCal Success", "type": "main", "index": 0 }],
      [{ "node": "Release Lock Fail", "type": "main", "index": 0 }]
    ]},
    "Release Lock Fail": { "main": [[{ "node": "Fail Response", "type": "main", "index": 0 }]] },
    "MOCK GCal Success": { "main": [[{ "node": "DB Insert", "type": "main", "index": 0 }]] },
    "DB Insert": { "main": [[{ "node": "Process DB", "type": "main", "index": 0 }], [{ "node": "Process DB", "type": "main", "index": 0 }]] },
    "Process DB": { "main": [[{ "node": "Release Lock Success", "type": "main", "index": 0 }]] },
    "Release Lock Success": { "main": [[{ "node": "Success Response", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
};

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
console.log('Orchestrator JSON built successfully.');
