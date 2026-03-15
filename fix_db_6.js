const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', 'utf8'));

// The n8n API gave "request/body must NOT have additional properties"
// This usually means we left some properties like "alwaysOutputData: true" on a node type that doesn't support it,
// OR we didn't remove ID/active properly. Let's make sure.

delete wf.id;
delete wf.active;
delete wf.createdAt;
delete wf.updatedAt;
delete wf.versionId;

// AlwaysOutputData is only valid on Postgres nodes, but let's check it's not causing issues
for (const node of wf.nodes) {
    if (node.alwaysOutputData && node.type !== 'n8n-nodes-base.postgres') {
        delete node.alwaysOutputData;
    }
}

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator.json', JSON.stringify(wf, null, 2));
