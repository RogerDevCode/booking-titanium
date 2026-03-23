import fs from 'fs';

const file = 'workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

const n = wf.nodes.find((n: any) => n.name === 'Format Success Output');
n.parameters.jsCode = n.parameters.jsCode.replace('INSERT succeeded but no booking_id returned. Result: \\\' + JSON.stringify($input.first().json) + \\\'', 'INSERT succeeded but no booking_id returned');

fs.writeFileSync(file, JSON.stringify(wf, null, 2));
