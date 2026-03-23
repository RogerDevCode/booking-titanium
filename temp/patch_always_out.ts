import fs from 'fs';

const file = 'workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

// Remove alwaysOutputData from Check Idempotency and Execute Insert
for (const nodeName of ['Check Idempotency', 'Execute Insert']) {
  const n = wf.nodes.find((x: any) => x.name === nodeName);
  if (n) {
    n.alwaysOutputData = false;
  }
}

fs.writeFileSync(file, JSON.stringify(wf, null, 2));
