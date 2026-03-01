const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 1. Añadir nodos de GCal y Gmail
const gcalExec = {
  "parameters": {
    "workflowId": "bc8zMLI9O5ytO7a2",
    "mode": "wait",
    "options": {}
  },
  "name": "Execute GCAL",
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [2400, 432],
  "id": "exec_gcal"
};

const gmailExec = {
  "parameters": {
    "workflowId": "pJmPTUO09YxJiqvb",
    "mode": "wait",
    "options": {}
  },
  "name": "Execute GMAIL",
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [2600, 432],
  "id": "exec_gmail"
};

data.nodes.push(gcalExec, gmailExec);

// 2. Reposicionar nodos finales
data.nodes.forEach(node => {
  if (node.name === 'Format Success') node.position = [2800, 432];
  if (node.name === 'Final Response') node.position = [3000, 432];
});

// 3. Reconectar: Execute NN_04 -> Execute GCAL -> Execute GMAIL -> Format Success
data.connections["Execute NN_04 (Telegram)"].main[0] = [{ "node": "Execute GCAL", "type": "main", "index": 0 }];
data.connections["Execute GCAL"] = { "main": [[{ "node": "Execute GMAIL", "type": "main", "index": 0 }]] };
data.connections["Execute GMAIL"] = { "main": [[{ "node": "Format Success", "type": "main", "index": 0 }]] };

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ Orquestación Médica integrada en NN_01');
