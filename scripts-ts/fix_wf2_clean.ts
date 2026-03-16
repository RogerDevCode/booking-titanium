import * as fs from 'fs';
import * as path from 'path';

// Read WF2 workflow
const wf2Path = path.join(__dirname, '../workflows/seed/wf2_booking_orchestrator_fixed.json');
const workflow = JSON.parse(fs.readFileSync(wf2Path, 'utf-8'));

// Create clean workflow for API update
const cleanWorkflow = {
  name: workflow.name,
  active: workflow.active,
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
  staticData: workflow.staticData,
  pinData: workflow.pinData
};

// Remove null/undefined properties
Object.keys(cleanWorkflow).forEach(key => {
  if (cleanWorkflow[key] === null || cleanWorkflow[key] === undefined) {
    delete cleanWorkflow[key];
  }
});

// Write clean workflow
const cleanPath = path.join(__dirname, '../workflows/seed/wf2_booking_orchestrator_clean.json');
fs.writeFileSync(cleanPath, JSON.stringify(cleanWorkflow, null, 2));

console.log('✅ Clean workflow saved to:', cleanPath);
