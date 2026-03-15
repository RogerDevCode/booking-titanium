const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_FINAL.json', 'utf8'));

// Delete absolutely everything except the strict allowed fields for the API
const strictWf = {
  name: wf.name,
  nodes: wf.nodes.map(n => ({
    name: n.name,
    type: n.type,
    typeVersion: n.typeVersion,
    position: n.position,
    parameters: n.parameters,
    credentials: n.credentials,
    webhookId: n.webhookId
  })),
  connections: wf.connections,
  settings: wf.settings,
  tags: []
};

// n8n requires credentials to be purely object of objects, without anything weird
for (const n of strictWf.nodes) {
    if (Object.keys(n.parameters).length === 0) {
        n.parameters = {};
    }
    if (!n.credentials) {
        delete n.credentials;
    }
    if (!n.webhookId) {
        delete n.webhookId;
    }
}

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_STRICT.json', JSON.stringify(strictWf, null, 2));
