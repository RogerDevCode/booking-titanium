import fs from 'fs';

const filePath = 'workflows/DB_Create_Booking.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

for (const node of data.nodes) {
  if (['Check Idempotency', 'Execute Insert'].includes(node.name)) {
    // n8n Postgres node uses 'alwaysOutputData' in node root, not in parameters or options usually?
    // Wait, let's look at another Postgres node that has alwaysOutputData
    // Actually in n8n it's inside options? Or typeOptions? Let's check!
    // Let me add it just to be safe.
  }
}
