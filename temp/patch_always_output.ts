import fs from 'fs';

const filePath = 'workflows/DB_Create_Booking.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

for (const node of data.nodes) {
  if (['Check Idempotency', 'Execute Insert'].includes(node.name)) {
    node.alwaysOutputData = true;
    console.log(`Patched ${node.name} with alwaysOutputData: true`);
  }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Patch saved successfully.');
