const fs = require('fs');

const rawWf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_CLEAN.json', 'utf8'));
const myWf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// We want to update rawWf with myWf nodes and connections, but keep rawWf structure
// The problem might be in the nodes array items containing unexpected keys.
// Let's explicitly build the nodes array with ONLY allowed keys for n8n-nodes-base
const allowedNodeKeys = ['parameters', 'name', 'type', 'typeVersion', 'position', 'id', 'credentials', 'onError', 'alwaysOutputData', 'webhookId'];

rawWf.nodes = myWf.nodes.map(n => {
    const cleanNode = {};
    for (const key of Object.keys(n)) {
        if (allowedNodeKeys.includes(key)) {
            cleanNode[key] = n[key];
        }
    }
    return cleanNode;
});

rawWf.connections = myWf.connections;
rawWf.settings = myWf.settings;

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_FINAL.json', JSON.stringify(rawWf, null, 2));
console.log("Created final clean payload");
