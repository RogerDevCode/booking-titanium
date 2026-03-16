import * as fs from 'fs';

const raw = fs.readFileSync('WF6.json', 'utf-8');
const wf = JSON.parse(raw);

// Find Validate & Prepare node
const validateNode = wf.nodes.find((n: any) => n.name === 'Validate & Prepare');

// Update Validate & Prepare code
validateNode.parameters.jsCode = `
const input = $input.first().json;
const body = input.body || input;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let booking_id = body.booking_id || null;
if (booking_id && !UUID_RE.test(booking_id)) {
  booking_id = null;
}

const payload = {
  gcal_event_id: body.gcal_event_id || null,
  booking_id: booking_id,
  lock_key: body.lock_key || null,
  owner_token: body.owner_token || null,
  reason: String(body.reason || 'manual_rollback').substring(0, 500)
};

if (!payload.gcal_event_id && !payload.booking_id && !payload.lock_key) {
  return [{ json: {
    _valid: false,
    success: false,
    error_code: 'INVALID_INPUT',
    error_message: 'Rollback requires at least one valid ID (gcal_event_id, booking_id, or lock_key)',
    data: null,
    _meta: { source: 'WF6_Rollback_Workflow', timestamp: new Date().toISOString() }
  }}];
}

const b64Reason = Buffer.from(payload.reason).toString('base64');

return [{ json: {
  _valid: true,
  ...payload,
  b64_reason: b64Reason,
  _rollback: {
    initiated_at: new Date().toISOString(),
    steps: { gcal: { success: true, skipped: true }, db: { success: true, skipped: true }, lock: { success: true, skipped: true } }
  }
}}];
`;

// Create the new IF node
const isValidNode = {
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "is_valid",
          "leftValue": "={{ $json._valid }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    }
  },
  "name": "Is Valid Input?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.3,
  "position": [400, 0],
  "id": "node-is-valid-input"
};

// Create Error Output Node
const errorNode = {
  "parameters": {
    "jsCode": "return $input.all();"
  },
  "name": "Return Error",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [650, 200],
  "id": "node-return-error"
};

// Remove existing IF node if it was added in previous runs
wf.nodes = wf.nodes.filter((n: any) => n.name !== 'Is Valid Input?' && n.name !== 'Return Error');
wf.nodes.push(isValidNode);
wf.nodes.push(errorNode);

// Update connections
wf.connections['Validate & Prepare'] = {
  main: [ [ { node: 'Is Valid Input?', type: 'main', index: 0 } ] ]
};

wf.connections['Is Valid Input?'] = {
  main: [
    [ { node: 'Has GCal?', type: 'main', index: 0 } ],
    [ { node: 'Return Error', type: 'main', index: 0 } ] // False goes to Return Error
  ]
};

const cleaned = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: {
    executionOrder: "v1",
    callerPolicy: "workflowsFromSameOwner",
    availableInMCP: false,
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
    saveExecutionProgress: true,
    saveManualExecutions: true
  }
};

fs.writeFileSync('WF6_patched.json', JSON.stringify(cleaned, null, 2));
console.log('Patched WF6 successfully.');
