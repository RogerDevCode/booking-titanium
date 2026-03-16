import * as fs from 'fs';
import * as path from 'path';

// Read WF2 workflow
const wf2Path = path.join(__dirname, '../workflows/seed/wf2_booking_orchestrator_active.json');
const workflow = JSON.parse(fs.readFileSync(wf2Path, 'utf-8'));

// Find the index of "Record GCal Success" node
const recordGCalIndex = workflow.nodes.findIndex((n: any) => n.name === 'Record GCal Success');
const createDBIndex = workflow.nodes.findIndex((n: any) => n.name === 'Create DB Booking');
const standardContractIndex = workflow.nodes.findIndex((n: any) => n.name === 'Standard Contract Output');

// Create new "Prepare DB Values" node
const prepareDBNode = {
  parameters: {
    jsCode: `// Prepare DB Values for Create Booking
// Extract values from GCal Event and context
const gcalEvent = $('Create GCal Event').first()?.json || {};
const ctx = $('Generate Idempotency Key').first()?.json?.ctx || {};

// GCal event ID is in data.id
const gcalEventId = gcalEvent.id || gcalEvent.data?.id || '';

// User ID with fallback to chat_id
const userId = ctx.user_id || ctx.chat_id || 0;

// Calculate end_time (start + 1 hour)
const startTime = new Date(ctx.start_time);
const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

return [{
  json: {
    ctx,
    gcal_event_id: gcalEventId,
    user_id: parseInt(userId.toString(), 10),
    end_time: endTime.toISOString()
  }
}];`
  },
  name: 'Prepare DB Values',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2375, 200] as [number, number],
  id: 'prep-db-values-' + Date.now()
};

// Insert the new node after "Record GCal Success"
workflow.nodes.splice(createDBIndex, 0, prepareDBNode);

// Update "Create DB Booking" node to use correct queryReplacement
const createDBNode: any = workflow.nodes.find((n: any) => n.name === 'Create DB Booking');
createDBNode.parameters.queryReplacement = '={{ [$json.ctx.provider_id, $json.ctx.service_id, $json.ctx.start_time, $json.ctx.idempotency_key, $json.gcal_event_id, $json.user_id] }}';

// Update connections
// Record GCal Success -> Prepare DB Values
workflow.connections['Record GCal Success'].main[0][0].node = 'Prepare DB Values';

// Prepare DB Values -> Create DB Booking
workflow.connections['Prepare DB Values'] = {
  main: [[{ node: 'Create DB Booking', type: 'main', index: 0 }]]
};

// Update workflow name to indicate fix
workflow.name = 'WF2_Booking_Orchestrator_FIXED';

// Write fixed workflow
const fixedPath = path.join(__dirname, '../workflows/seed/wf2_booking_orchestrator_fixed.json');
fs.writeFileSync(fixedPath, JSON.stringify(workflow, null, 2));

console.log('✅ WF2 fixed workflow saved to:', fixedPath);
console.log('📝 Changes:');
console.log('   - Added "Prepare DB Values" Code node');
console.log('   - Fixed queryReplacement in "Create DB Booking"');
console.log('   - Updated connections');
