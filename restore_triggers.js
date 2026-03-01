const fs = require('fs');
const workflows = [
  { file: 'workflows/NN_02_Message_Parser.json', path: 'nn-02-booking-parser-test' },
  { file: 'workflows/NN_03_AI_Agent.json', path: 'nn-03-ai-agent-test' },
  { file: 'workflows/DB_Create_Booking.json', path: 'db-create-booking-test' },
  { file: 'workflows/DB_Get_Availability.json', path: 'db-get-availability-test' }
];

workflows.forEach(wf => {
  if (!fs.existsSync(wf.file)) return;
  const data = JSON.parse(fs.readFileSync(wf.file, 'utf8'));
  
  const webhookNode = {
    "parameters": { "httpMethod": "POST", "path": wf.path, "responseMode": "lastNode" },
    "name": "Webhook",
    "type": "n8n-nodes-base.webhook",
    "typeVersion": 2,
    "position": [-200, 400],
    "webhookId": wf.path
  };

  const manualNode = {
    "parameters": {},
    "name": "Manual Trigger",
    "type": "n8n-nodes-base.manualTrigger",
    "typeVersion": 1,
    "position": [-200, 200]
  };

  // Asegurar que no haya duplicados
  data.nodes = data.nodes.filter(n => !n.type.includes('Trigger') && n.type !== 'n8n-nodes-base.webhook');
  
  const execTrigger = {
    "parameters": { "inputSource": "passthrough" },
    "name": "Execute Workflow Trigger",
    "type": "n8n-nodes-base.executeWorkflowTrigger",
    "typeVersion": 1.1,
    "position": [-200, 600]
  };

  data.nodes.push(webhookNode, manualNode, execTrigger);

  // Encontrar el primer nodo de logica
  const firstLogic = data.nodes.find(n => n.name.includes('Validate') || n.name.includes('Prep') || n.name.includes('Build')) || data.nodes[0];

  data.connections["Webhook"] = { "main": [[{ "node": firstLogic.name, "type": "main", "index": 0 }]] };
  data.connections["Manual Trigger"] = { "main": [[{ "node": firstLogic.name, "type": "main", "index": 0 }]] };
  data.connections["Execute Workflow Trigger"] = { "main": [[{ "node": firstLogic.name, "type": "main", "index": 0 }]] };

  fs.writeFileSync(wf.file, JSON.stringify(data, null, 2));
  console.log(`✅ Triggers restaurados en ${wf.file}`);
});
