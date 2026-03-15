const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_FINAL.json', 'utf8'));

const checkDb = wf.nodes.find(n => n.name === 'Check Idempotency DB');
if (checkDb) {
    checkDb.parameters.options = {
        queryReplacement: "={{ $json.ctx.idempotency_key }}"
    };
    checkDb.parameters.query = "SELECT b.id as booking_id, b.status, b.gcal_event_id FROM (SELECT 1) dummy LEFT JOIN bookings b ON b.idempotency_key = $1::text AND b.status != 'CANCELLED' LIMIT 1;";
}

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_FINAL.json', JSON.stringify(wf, null, 2));
