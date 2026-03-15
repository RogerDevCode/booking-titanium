const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// n8n is rejecting the body because of additional properties in the *nodes* array items.
// Let's strip down nodes to ONLY standard n8n properties.
wf.nodes = wf.nodes.map(n => {
    return {
        id: n.id,
        name: n.name,
        type: n.type,
        typeVersion: n.typeVersion,
        position: n.position,
        parameters: n.parameters,
        credentials: n.credentials,
        onError: n.onError,
        alwaysOutputData: n.alwaysOutputData,
        webhookId: n.webhookId
    };
});

// Remove any undefined keys
wf.nodes = wf.nodes.map(n => {
    Object.keys(n).forEach(key => n[key] === undefined && delete n[key]);
    return n;
});

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
