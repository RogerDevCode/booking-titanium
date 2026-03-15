const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// Delete the specific nodes that are causing "additional properties" issues
for (const node of wf.nodes) {
    if (node.alwaysOutputData) delete node.alwaysOutputData;
    if (node.onError) delete node.onError;
    if (node.credentials) {
        // Just make sure credentials object is properly formatted
        if (typeof node.credentials !== 'object') delete node.credentials;
    }
}

// Add them back properly to Postgres and HTTP Request nodes
for (const node of wf.nodes) {
    if (node.type === 'n8n-nodes-base.postgres' && node.name === 'Check DB Idempotency') {
        node.alwaysOutputData = true;
    }
    
    // Most nodes need onError: "continueErrorOutput"
    if (['Check DB Idempotency', 'Acquire Lock', 'Check Avail Under Lock', 'Release Lock Error', 'Check CB Status', 'Release Lock CB Open', 'DLQ (CB Open)', 'Create GCal Event', 'Record Fail CB', 'Release Lock GCal Fail', 'Create DB Record', 'Rollback GCal', 'Release Lock Success'].includes(node.name)) {
        node.onError = "continueErrorOutput";
    }
}

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
