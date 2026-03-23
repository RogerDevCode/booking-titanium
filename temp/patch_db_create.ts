import fs from 'fs';

const file = 'workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

const originalCount = wf.nodes.length;

// 1. Remove "Is New?" node
wf.nodes = wf.nodes.filter((n: any) => n.name !== 'Is New?');

// 2. Change Webhook responseMode to responseNode
const webhook = wf.nodes.find((n: any) => n.name === 'Webhook');
if (webhook) {
  webhook.parameters.responseMode = 'responseNode';
}

// 3. Add Respond to Webhook node
const respondNode = {
  "parameters": {
    "respondWith": "firstIncomingItem",
    "options": {}
  },
  "name": "Respond to Webhook",
  "type": "n8n-nodes-base.respondToWebhook",
  "typeVersion": 1.1,
  "position": [ 1980, 400 ],
  "id": "respond-to-webhook-id"
};
wf.nodes.push(respondNode);

// 4. Modify Build Insert Query to act as Gate
const buildQuery = wf.nodes.find((n: any) => n.name === 'Build Insert Query');
if (buildQuery) {
  buildQuery.parameters.jsCode = `// GATE: Only build query for _route === 'new'
const input = $input.first().json;
if (input._route !== 'new') return [];

const { provider_id, service_id, start_time, end_time, idempotency_key, gcal_event_id, chat_id, status } = input;
const esc = (v) => v.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "''").substring(0, 255);

const insert_query = \`INSERT INTO bookings (
  provider_id, service_id, start_time, end_time,
  idempotency_key, gcal_event_id, user_id, status, created_at
) VALUES (
  \${Number(provider_id)}::int,
  \${Number(service_id)}::int,
  '\${esc(start_time)}'::timestamptz,
  \${end_time ? \`'\${esc(end_time)}'::timestamptz\` : 'NULL'},
  '\${esc(idempotency_key)}'::text,
  \${gcal_event_id ? \`'\${esc(gcal_event_id)}'::text\` : 'NULL'},
  \${chat_id !== null && chat_id !== undefined ? \`\${Number(chat_id)}::bigint\` : 'NULL'},
  \${status ? \`'\${esc(status)}'::text\` : "'CONFIRMED'::text"},
  NOW()
) RETURNING id, status;\`;

return [{ json: { ...input, insert_query } }];`;
}

// 5. Modify Pass Through Error to act as Gate
const passError = wf.nodes.find((n: any) => n.name === 'Pass Through Error');
if (passError) {
  passError.parameters.jsCode = `const input = $input.first().json;
if (input._route === 'new') return [];
return [{ json: input }];`;
}

// 6. Fix connections
// Route By Idempotency -> Build Insert Query & Pass Through Error
if (wf.connections['Route By Idempotency']) {
  wf.connections['Route By Idempotency'] = {
    "main": [
      [
        { "node": "Build Insert Query", "type": "main", "index": 0 },
        { "node": "Pass Through Error", "type": "main", "index": 0 }
      ]
    ]
  };
}

// Format Response -> Respond to Webhook
if (wf.connections['Format Response']) {
  wf.connections['Format Response'] = {
    "main": [
      [
        { "node": "Respond to Webhook", "type": "main", "index": 0 }
      ]
    ]
  };
}

// Remove Is New? from connections
if (wf.connections['Is New?']) {
  delete wf.connections['Is New?'];
}

fs.writeFileSync(file, JSON.stringify(wf, null, 2));
console.log(JSON.stringify({
  originalCount,
  newCount: wf.nodes.length
}));
