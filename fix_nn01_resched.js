const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Añadir nodo de Reagendamiento
const reschedNode = {
  "parameters": {
    "workflowId": { "__rl": true, "value": "ThlQf7zJi9PXGw6c", "mode": "id" },
    "mode": "wait"
  },
  "name": "Flow: RESCHEDULE",
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [850, 700],
  "id": "flow_resched"
};

data.nodes.push(reschedNode);

// Actualizar Switch
data.nodes.forEach(node => {
  if (node.name === 'Intent Switch') {
    node.parameters.rules.values.push({ "value1": "={{ $json.data.intent }}", "value2": "RESCHEDULE", "operation": "equal" });
  }
});

// Conectar
data.connections["Intent Switch"].main.push([{ "node": "Flow: RESCHEDULE", "type": "main", "index": 0 }]);
data.connections["Flow: RESCHEDULE"] = { "main": [[{ "node": "Standard Success Output", "type": "main", "index": 0 }]] };

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
