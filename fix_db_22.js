const fs = require('fs');

const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// Delete the specific nodes that are causing "additional properties" issues
for (const node of wf.nodes) {
    if (node.alwaysOutputData) {
        console.log('removing alwaysOutputData from', node.name);
        delete node.alwaysOutputData;
    }
}

const checkDb = wf.nodes.find(n => n.name === 'Check Idempotency DB' || n.name === 'Check DB Idempotency');
if (checkDb) {
    checkDb.parameters.query = "SELECT b.id as booking_id, b.status, b.gcal_event_id FROM (SELECT 1) dummy LEFT JOIN bookings b ON b.idempotency_key = $1::text AND b.status != 'CANCELLED' LIMIT 1;";
}

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
