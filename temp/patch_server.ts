import fs from 'fs';

const serverFile = 'temp/server_wf.json';
const data = JSON.parse(fs.readFileSync(serverFile, 'utf-8'));

// 1. Patch Route By Idempotency (index 7 usually)
const rbi = data.nodes.find(n => n.name === 'Route By Idempotency');
if (rbi) {
  rbi.parameters.jsCode = `const pgResult = $input.first().json;
const upstreamData = $('Build Idempotency Check Query').isExecuted
  ? $('Build Idempotency Check Query').first().json
  : null;

if (upstreamData && upstreamData._exit_early) {
  return [{ json: { ...upstreamData, _route: 'error' } }];
}

const originalData = upstreamData && upstreamData._validated ? upstreamData : null;
if (!originalData) {
  return [{ json: {
    success: false, error_code: 'PIPELINE_ERROR',
    error_message: 'Validated data lost in Route By Idempotency',
    data: null, _route: 'error',
    _meta: { source: 'DB_Create_Booking', timestamp: new Date().toISOString(), workflow_id: $workflow.id }
  }}];
}

const hasExisting = pgResult && pgResult.id !== undefined && pgResult.id !== null;
if (hasExisting) {
  return [{ json: {
    success: true, error_code: null, error_message: null,
    data: { booking_id: pgResult.id, status: pgResult.status || 'CONFIRMED', is_duplicate: true },
    _meta: { source: 'DB_Create_Booking', timestamp: new Date().toISOString(), workflow_id: $workflow.id },
    _route: 'existing'
  }}];
}

return [{ json: { ...originalData, _route: 'new' } }];`;
}

// 2. Add "Is New?" IF node
const ifNode = {
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "is_new",
          "leftValue": "={{ $json._route }}",
          "operator": {
            "type": "string",
            "operation": "equals"
          },
          "rightValue": "new"
        }
      ],
      "combinator": "and"
    }
  },
  "name": "Is New?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2.3,
  "position": [ 1100, 304 ],
  "id": "new-if-uuid-" + Math.random().toString(16).slice(2)
};
data.nodes.push(ifNode);

// 3. Rewire
data.connections['Route By Idempotency'] = {
  main: [ [ { node: 'Is New?', type: 'main', index: 0 } ] ]
};
data.connections['Is New?'] = {
  main: [
    [ { node: 'Build Insert Query', type: 'main', index: 0 } ],
    [ { node: 'Pass Through Error', type: 'main', index: 0 } ]
  ]
};

// 4. Update Format Response
const fr = data.nodes.find(n => n.name === 'Format Response');
if (fr) {
  fr.parameters.jsCode = `const items = $input.all();
if (!items || items.length === 0) return [{ json: { success: false, error_code: 'EMPTY_RESULT', error_message: 'Expected items but got none' } }];
const input = items[0].json;
return [{ json: {
  success: input.success === true,
  error_code: input.error_code || null,
  error_message: input.error_message || null,
  data: input.data || null,
  _meta: input._meta || {
    source: 'DB_Create_Booking', timestamp: new Date().toISOString(), workflow_id: $workflow.id
  }
}}];`;
}

// 5. Final sanitation - remove anything not in the original server file keys
const originalKeys = ["id", "name", "parameters", "position", "type", "typeVersion", "webhookId", "credentials", "onError", "alwaysOutputData"];
data.nodes.forEach(node => {
    Object.keys(node).forEach(key => {
        if (!originalKeys.includes(key)) delete node[key];
    });
});

fs.writeFileSync('temp/patched_wf.json', JSON.stringify(data, null, 2));
