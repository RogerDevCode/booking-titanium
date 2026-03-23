import fs from 'fs';

const filePath = 'workflows/DB_Create_Booking.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

for (const node of data.nodes) {
  if (node.name === 'Route By Idempotency') {
    node.parameters.numberOutputs = 2;
    console.log("Added numberOutputs: 2 to Route By Idempotency");
  }
}

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
