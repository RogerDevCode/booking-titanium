const fs = require('fs');
const files = [
  'workflows/NN_02_Message_Parser.json',
  'workflows/NN_03_AI_Agent.json',
  'workflows/DB_Create_Booking.json',
  'workflows/GCAL_Create_Event.json',
  'workflows/GMAIL_Send_Confirmation.json'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  
  // 1. Filtrar nodos para dejar solo el Execute Workflow Trigger como entrada
  const triggerNode = {
    "parameters": { "inputSource": "passthrough" },
    "name": "Execute Workflow Trigger",
    "type": "n8n-nodes-base.executeWorkflowTrigger",
    "typeVersion": 1.1,
    "position": [0, 400],
    "id": "trigger_unique"
  };

  // Mantener solo nodos de lógica (no otros triggers)
  const logicNodes = data.nodes.filter(n => !n.type.includes('Trigger') && n.type !== 'n8n-nodes-base.webhook');
  
  // Re-identificar el primer nodo de logica para conectar
  const firstLogicNode = logicNodes.find(n => n.name.includes('Validate') || n.name.includes('Parser') || n.name.includes('Groq') || n.name.includes('Call') || n.name.includes('Google') || n.name.includes('Gmail')) || logicNodes[0];

  data.nodes = [triggerNode, ...logicNodes];
  
  // Re-conectar
  data.connections["Execute Workflow Trigger"] = {
    "main": [[{ "node": firstLogicNode.name, "type": "main", "index": 0 }]]
  };

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`✅ Workflow ${file} normalizado.`);
});
