import fs from 'fs';

const file = 'workflows/DB_Create_Booking.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));

for (const nodeName of ['Check Idempotency', 'Execute Insert']) {
  const n = wf.nodes.find((x: any) => x.name === nodeName);
  if (n) n.alwaysOutputData = true;
}

const formatSuccess = wf.nodes.find((n: any) => n.name === 'Format Success Output');
if (formatSuccess) {
  formatSuccess.parameters.jsCode = `// Format success — new booking created
const result = $input.first().json;
const upstreamData = $('Build Insert Query').isExecuted ? $('Build Insert Query').first().json : {};
const booking_id = result.id || null;

if (!booking_id) {
  // If no ID is returned, an error likely occurred (handled by Handle Insert Error branch).
  // Return empty array to stop this branch from generating a conflicting response.
  return [];
}

return [{ json: {
  ...upstreamData,
  success: true, error_code: null, error_message: null,
  data: { booking_id, status: result.status || 'CONFIRMED', is_duplicate: false },
  _meta: { source: 'DB_Create_Booking', timestamp: new Date().toISOString(), workflow_id: $workflow.id }
}}];`;
}

fs.writeFileSync(file, JSON.stringify(wf, null, 2));
console.log("Updated workflow.");
