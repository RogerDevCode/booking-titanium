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
      "parameters": {},
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [0, -200]
    },
    {
      "parameters": {
        "inputSource": "passthrough"
      },
      "name": "Execute Workflow Trigger",
      "type": "n8n-nodes-base.executeWorkflowTrigger",
      "typeVersion": 1.1,
      "position": [0, 200]
    },
    {
      "parameters": {
        "jsCode": `
const body = $input.first().json.body || $input.first().json;
const provider_id = parseInt(body.provider_id, 10);
const service_id = parseInt(body.service_id, 10);
const start_time = body.start_time;

if (isNaN(provider_id) || isNaN(service_id) || !start_time) {
  throw new Error('Missing core fields');
}

const duration = parseInt(body.duration_minutes || 60, 10);
const startDate = new Date(start_time);
const endDate = new Date(startDate.getTime() + duration * 60000);

const cleanTime = String(start_time).replace(/[^0-9]/g, '');
const idempotency_key = \`booking_\${provider_id}_\${service_id}_\${cleanTime}_\${body.customer_id || body.chat_id || 'anon'}\`;

return [{ json: {
  provider_id, service_id, start_time, end_time: endDate.toISOString(),
  duration_minutes: duration,
  customer_id: body.customer_id || null,
  chat_id: body.chat_id || null,
  event_title: body.event_title || 'Appointment',
  idempotency_key,
  original_body: body,
  _meta: { source: 'WF2_Orchestrator', version: '3.1', started_at: new Date().toISOString() }
}}];`
      },
      "name": "Validate",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [250, 0]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT id as booking_id, status, gcal_event_id FROM bookings WHERE idempotency_key = $1 LIMIT 1;",
        "options": { "queryReplacement": "={{ $json.idempotency_key }}" }
      },
      "name": "Idemp Check",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [500, 0],
      "credentials": { "postgres": { "id": "SFNQsmuu4zirZAnP", "name": "Postgres account" } },
      "alwaysOutputData": true
    },
    {
      "parameters": {
        "jsCode": `
const items = $input.all();
const val = $('Validate').first().json;
const dup = (items.length > 0 && items[0].json.booking_id) ? items[0].json : null;
return [{ json: { ...val, _is_dup: !!dup, _dup: dup } }];`
      },
      "name": "Process Idemp",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [750, 0]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [{ "id": "dup", "leftValue": "={{ $json._is_dup }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }],
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
        "jsCode": `
const d = $input.first().json._dup;
const meta = $('Validate').first().json._meta;
return [{ json: {
  success: true,
  data: { booking_id: d.booking_id, status: d.status, gcal_event_id: d.gcal_event_id, is_duplicate: true },
  _meta: meta
}}];`
      },
      "name": "Duplicate Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1250, 150]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/acquire-lock",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ provider_id: $json.provider_id, start_time: $json.start_time }) }}",
        "options": { "timeout": 10000, "includeInputData": true }
      },
      "name": "Lock Acquire",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [1250, -150],
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
      "position": [1500, -150]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [{ "id": "lock", "leftValue": "={{ $json._lock_ok }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }],
          "combinator": "and"
        }
      },
      "name": "Lock OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [1750, -150]
    },
    {
      "parameters": {
        "jsCode": `
const val = $('Validate').first().json;
return [{ json: {
  success: false, error_code: 'LOCK_DENIED',
  _meta: val._meta
}}];`
      },
      "name": "Lock Denied SCO",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2000, 0]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/circuit-breaker/check",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{\"service_id\": \"google_calendar\"}",
        "options": { "timeout": 10000, "includeInputData": true }
      },
      "name": "Check CB",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [2000, -250],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const res = $input.first().json;
const ctx = $('Process Lock').first().json;
const ok = res.data?.allowed === true;
return [{ json: { ...ctx, _cb_ok: ok, _cb_err: res.error || null } }];`
      },
      "name": "Process CB",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2250, -250]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [{ "id": "cb", "leftValue": "={{ $json._cb_ok }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }],
          "combinator": "and"
        }
      },
      "name": "CB OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [2500, -250]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/release-lock",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ lock_key: $('Process Lock').first().json._lock_key, owner_token: $('Process Lock').first().json._owner_token }) }}",
        "options": { "includeInputData": true }
      },
      "name": "Release Lock Fail",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [2750, -100],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/dlq/add",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ failure_reason: 'CB_OR_AVAIL_FAIL', original_payload: $('Validate').first().json.original_body }) }}",
        "options": {}
      },
      "name": "Queue to DLQ",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [3000, -100],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const val = $('Validate').first().json;
return [{ json: { success: false, error_code: 'ORCHESTRATOR_ABORTED', _meta: val._meta } }];`
      },
      "name": "Abort SCO",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [3250, -100]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/check-availability",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ provider_id: $json.provider_id, service_id: $json.service_id, start_time: $json.start_time }) }}",
        "options": { "timeout": 20000, "includeInputData": true }
      },
      "name": "Check Avail",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [2750, -350],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const res = $input.first().json;
const ctx = $('Process CB').first().json;
const ok = res.data?.available === true;
return [{ json: { ...ctx, _avail_ok: ok, _avail_err: res.error || null } }];`
      },
      "name": "Process Avail",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [3000, -350]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [{ "id": "av", "leftValue": "={{ $json._avail_ok }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }],
          "combinator": "and"
        }
      },
      "name": "Avail OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [3250, -350]
    },
    {
      "parameters": {
        "operation": "create",
        "calendar": { "__rl": true, "value": "primary", "mode": "list" },
        "start": "={{ $json.start_time }}",
        "end": "={{ new Date(new Date($json.start_time).getTime() + $json.duration_minutes*60000).toISOString() }}",
        "additionalFields": { "summary": "={{ $json.event_title }}" },
        "options": { "includeInputData": true }
      },
      "name": "Create GCal",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [3500, -450],
      "credentials": { "googleCalendarOAuth2Api": { "id": "OsRBfz3Cs7Ph5uV5", "name": "Google Calendar account" } },
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const res = $input.first().json;
const ctx = $('Process Avail').first().json;
const ok = !!res.id;
return [{ json: { ...ctx, _gcal_ok: ok, _gcal_id: res.id || null, _gcal_err: res.message || null } }];`
      },
      "name": "Process GCal",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [3750, -450]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [{ "id": "gc", "leftValue": "={{ $json._gcal_ok }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }],
          "combinator": "and"
        }
      },
      "name": "GCal OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [4000, -450]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/circuit-breaker/record",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{\"service_id\": \"google_calendar\", \"success\": false}",
        "options": {}
      },
      "name": "Record Fail",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [4250, -350],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "INSERT INTO bookings (provider_id, service_id, start_time, end_time, idempotency_key, gcal_event_id, status) VALUES ($1::int, $2::int, $3::timestamp, $4::timestamp, $5::text, $6::text, 'CONFIRMED') RETURNING id;",
        "options": {
          "queryReplacement": "={{ $json.provider_id }}, {{ $json.service_id }}, {{ $json.start_time }}, {{ $json.end_time }}, {{ $json.idempotency_key }}, {{ $json._gcal_id }}"
        }
      },
      "name": "Create DB",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [4250, -600],
      "credentials": { "postgres": { "id": "SFNQsmuu4zirZAnP", "name": "Postgres account" } },
      "alwaysOutputData": true,
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const res = $input.first().json;
const ctx = $('Process GCal').first().json;
const ok = !!res.id;
return [{ json: { ...ctx, _db_ok: ok, _db_id: res.id || null, _db_err: res.message || null } }];`
      },
      "name": "Process DB",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [4500, -600]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "strict" },
          "conditions": [{ "id": "db", "leftValue": "={{ $json._db_ok }}", "rightValue": true, "operator": { "type": "boolean", "operation": "equals" } }],
          "combinator": "and"
        }
      },
      "name": "DB OK?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [4750, -600]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/rollback-booking",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ gcal_event_id: $json._gcal_id, lock_key: $('Process Lock').first().json._lock_key, owner_token: $('Process Lock').first().json._owner_token, reason: 'DB_FAIL' }) }}",
        "options": { "timeout": 30000 }
      },
      "name": "Rollback",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [5000, -500],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/circuit-breaker/record",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{\"service_id\": \"google_calendar\", \"success\": true}",
        "options": {}
      },
      "name": "Record Success",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [5000, -750],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://n8n:5678/webhook/release-lock",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ lock_key: $('Process Lock').first().json._lock_key, owner_token: $('Process Lock').first().json._owner_token }) }}",
        "options": { "timeout": 10000 }
      },
      "name": "Release Lock Final",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [5250, -750],
      "onError": "continueErrorOutput"
    },
    {
      "parameters": {
        "jsCode": `
const ctx = $('Process DB').first().json;
return [{ json: { success: true, data: { booking_id: ctx._db_id, gcal_id: ctx._gcal_id }, _meta: ctx._meta } }];`
      },
      "name": "Success SCO",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [5500, -750]
    }
  ],
  "connections": {
    "Webhook": { "main": [[{ "node": "Validate", "type": "main", "index": 0 }]] },
    "Validate": { "main": [[{ "node": "Idemp Check", "type": "main", "index": 0 }]] },
    "Idemp Check": { "main": [[{ "node": "Process Idemp", "type": "main", "index": 0 }]] },
    "Process Idemp": { "main": [[{ "node": "Is Duplicate?", "type": "main", "index": 0 }]] },
    "Is Duplicate?": { "main": [
      [{ "node": "Duplicate Response", "type": "main", "index": 0 }],
      [{ "node": "Lock Acquire", "type": "main", "index": 0 }]
    ]},
    "Lock Acquire": { "main": [[{ "node": "Process Lock", "type": "main", "index": 0 }], [{ "node": "Process Lock", "type": "main", "index": 0 }]] },
    "Process Lock": { "main": [[{ "node": "Lock OK?", "type": "main", "index": 0 }]] },
    "Lock OK?": { "main": [
      [{ "node": "Check CB", "type": "main", "index": 0 }],
      [{ "node": "Lock Denied SCO", "type": "main", "index": 0 }]
    ]},
    "Check CB": { "main": [[{ "node": "Process CB", "type": "main", "index": 0 }], [{ "node": "Process CB", "type": "main", "index": 0 }]] },
    "Process CB": { "main": [[{ "node": "CB OK?", "type": "main", "index": 0 }]] },
    "CB OK?": { "main": [
      [{ "node": "Check Avail", "type": "main", "index": 0 }],
      [{ "node": "Release Lock Fail", "type": "main", "index": 0 }]
    ]},
    "Check Avail": { "main": [[{ "node": "Process Avail", "type": "main", "index": 0 }], [{ "node": "Process Avail", "type": "main", "index": 0 }]] },
    "Process Avail": { "main": [[{ "node": "Avail OK?", "type": "main", "index": 0 }]] },
    "Avail OK?": { "main": [
      [{ "node": "Create GCal", "type": "main", "index": 0 }],
      [{ "node": "Release Lock Fail", "type": "main", "index": 0 }]
    ]},
    "Release Lock Fail": { "main": [[{ "node": "Queue to DLQ", "type": "main", "index": 0 }]] },
    "Queue to DLQ": { "main": [[{ "node": "Abort SCO", "type": "main", "index": 0 }]] },
    "Create GCal": { "main": [[{ "node": "Process GCal", "type": "main", "index": 0 }], [{ "node": "Process GCal", "type": "main", "index": 0 }]] },
    "Process GCal": { "main": [[{ "node": "GCal OK?", "type": "main", "index": 0 }]] },
    "GCal OK?": { "main": [
      [{ "node": "Create DB", "type": "main", "index": 0 }],
      [{ "node": "Record Fail", "type": "main", "index": 0 }]
    ]},
    "Record Fail": { "main": [[{ "node": "Release Lock Fail", "type": "main", "index": 0 }]] },
    "Create DB": { "main": [[{ "node": "Process DB", "type": "main", "index": 0 }], [{ "node": "Process DB", "type": "main", "index": 0 }]] },
    "Process DB": { "main": [[{ "node": "DB OK?", "type": "main", "index": 0 }]] },
    "DB OK?": { "main": [
      [{ "node": "Record Success", "type": "main", "index": 0 }],
      [{ "node": "Rollback", "type": "main", "index": 0 }]
    ]},
    "Record Success": { "main": [[{ "node": "Release Lock Final", "type": "main", "index": 0 }]] },
    "Rollback": { "main": [[{ "node": "Release Lock Fail", "type": "main", "index": 0 }]] },
    "Release Lock Final": { "main": [[{ "node": "Success SCO", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
};

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
