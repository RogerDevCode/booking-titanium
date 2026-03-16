import * as fs from 'fs';
import * as path from 'path';

// Read WF2 workflow
const wf2Path = path.join(__dirname, '../workflows/seed/wf2_booking_orchestrator_fixed.json');
const workflow = JSON.parse(fs.readFileSync(wf2Path, 'utf-8'));

// Fix Create DB Booking node - remove duplicate queryReplacement
const createDBNode: any = workflow.nodes.find((n: any) => n.name === 'Create DB Booking');
if (createDBNode) {
  // Remove old queryReplacement from options
  if (createDBNode.parameters.options?.queryReplacement) {
    delete createDBNode.parameters.options.queryReplacement;
  }
  // Ensure correct queryReplacement is at the right level
  createDBNode.parameters.queryReplacement = '={{ [$json.ctx.provider_id, $json.ctx.service_id, $json.ctx.start_time, $json.ctx.idempotency_key, $json.gcal_event_id, $json.user_id] }}';
}

// Create clean workflow for API
const cleanWorkflow = {
  name: 'WF2_Booking_Orchestrator',
  nodes: workflow.nodes.map((node: any) => ({
    parameters: node.parameters,
    name: node.name,
    type: node.type,
    typeVersion: node.typeVersion,
    position: node.position,
    id: node.id,
    credentials: node.credentials,
    webhookId: node.webhookId,
    alwaysOutputData: node.alwaysOutputData
  })),
  connections: workflow.connections,
  settings: workflow.settings,
  staticData: null,
  pinData: null
};

// Write clean workflow
const cleanPath = path.join(__dirname, '../workflows/seed/wf2_booking_orchestrator_final.json');
fs.writeFileSync(cleanPath, JSON.stringify(cleanWorkflow, null, 2));

console.log('✅ Final clean workflow saved to:', cleanPath);
console.log('📝 Fixed: Removed duplicate queryReplacement from Create DB Booking');
