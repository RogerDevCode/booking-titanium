const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// n8n is rejecting the payload because of "additional properties".
// Wf objects should only have: createdAt, updatedAt, id, name, active, nodes, connections, settings, staticData, meta, tags
const cleanWf = {
  name: wf.name,
  nodes: wf.nodes.map(n => {
    // some properties might be invalid on nodes
    delete n.alwaysOutputData; 
    if (n.type === 'n8n-nodes-base.postgres') {
       n.alwaysOutputData = true; // Add it back properly if needed
    }
    return n;
  }),
  connections: wf.connections,
  settings: wf.settings,
};

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(cleanWf, null, 2));
console.log('Cleaned WF object structure.');
