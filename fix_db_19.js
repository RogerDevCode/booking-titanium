const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// The tests are failing with 404 because the webhook node's webhookId is missing in our fixed version 
// or the workflow is not activated properly, so the webhook endpoint is not registered.
// Let's verify the webhook node.
const webhookNode = wf.nodes.find(n => n.name === 'Webhook');
if (webhookNode) {
    if (!webhookNode.webhookId) {
        webhookNode.webhookId = "booking-orchestrator";
    }
}

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
