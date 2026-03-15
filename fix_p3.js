const fs = require('fs');

const path = './workflows/seed/cb_gcal_circuit_breaker.json';
const wf = JSON.parse(fs.readFileSync(path, 'utf8'));

wf.settings = wf.settings || {};
wf.settings.errorWorkflow = "B1VnkirO5dF20MHg";

fs.writeFileSync(path, JSON.stringify(wf, null, 2));
console.log('P3 applied: Added errorWorkflow link');
