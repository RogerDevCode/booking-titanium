import * as fs from 'fs';

const raw = fs.readFileSync('WF2_base.json', 'utf-8');
const wf = JSON.parse(raw);

// 1. Create the new Postgres node for Upsert User
const upsertUserNode = {
  parameters: {
    operation: 'executeQuery',
    query: "INSERT INTO users (chat_id, full_name, email) VALUES ($1::bigint, $2::text, $3::text) ON CONFLICT (chat_id) DO UPDATE SET updated_at = NOW() RETURNING chat_id;",
    options: {
      queryReplacement: "={{ [$json.user_id, $json.ctx.user_name || 'Test User', $json.ctx.user_email || 'test@example.com'] }}"
    }
  },
  name: 'Ensure User Exists',
  type: 'n8n-nodes-base.postgres',
  typeVersion: 2.6,
  position: [2430, 200],
  id: 'node-upsert-user',
  credentials: {
    postgres: {
      id: '5LzvCP9BsQwCi9Z0',
      name: 'Postgres account'
    }
  }
};

// 2. Add the node to the workflow
wf.nodes.push(upsertUserNode);

// 3. Update connections
// Old: Prepare DB Values -> Create DB Booking
// New: Prepare DB Values -> Ensure User Exists -> Create DB Booking

// Find connection from Prepare DB Values
const prepareNodeName = 'Prepare DB Values';
const createNodeName = 'Create DB Booking';

wf.connections[prepareNodeName].main[0] = [ { node: 'Ensure User Exists', type: 'main', index: 0 } ];
wf.connections['Ensure User Exists'] = {
  main: [ [ { node: createNodeName, type: 'main', index: 0 } ] ]
};

// 4. Save patched workflow
const cleaned = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings
};

fs.writeFileSync('WF2_upsert.json', JSON.stringify(cleaned, null, 2));
console.log('Patched WF2 with Ensure User Exists node.');
