const fs = require('fs');

const path = './workflows/seed/cb_gcal_circuit_breaker.json';
const wf = JSON.parse(fs.readFileSync(path, 'utf8'));

// P1: Add Execute Workflow Trigger for Check flow
wf.nodes.push({
  "parameters": {},
  "name": "Execute Workflow Trigger",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1.1,
  "position": [0, -100],
  "id": "cb_exec_trigger_01"
});
wf.connections["Execute Workflow Trigger"] = {
  "main": [[{ "node": "Validate Input", "type": "main", "index": 0 }]]
};

// P1: Add Execute Workflow Trigger for Record flow
wf.nodes.push({
  "parameters": {},
  "name": "Execute Workflow Trigger 2",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1.1,
  "position": [0, 500],
  "id": "cb_exec_trigger_02"
});
wf.connections["Execute Workflow Trigger 2"] = {
  "main": [[{ "node": "Validate Record Request", "type": "main", "index": 0 }]]
};

fs.writeFileSync(path, JSON.stringify(wf, null, 2));
console.log('P1 applied: Added When Called triggers');
