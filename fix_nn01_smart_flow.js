const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Añadir nodo de Disponibilidad Inteligente
const lookupNode = {
  "parameters": {
    "workflowId": { "__rl": true, "value": "cWWCjvSLdw6gbp7J", "mode": "id" },
    "mode": "wait"
  },
  "name": "Lookup Availability",
  "type": "n8n-nodes-base.executeWorkflow",
  "typeVersion": 1.3,
  "position": [50, 432],
  "id": "lookup_avail"
};

data.nodes.push(lookupNode);

// Re-conectar: Execute NN_02 -> Lookup Availability -> Execute NN_03
data.connections["Execute NN_02"].main[0] = [{ "node": "Lookup Availability", "type": "main", "index": 0 }];
data.connections["Lookup Availability"] = { "main": [[{ "node": "Execute NN_03 (AI)", "type": "main", "index": 0 }]] };

// Actualizar Execute NN_03 para pasar la disponibilidad
data.nodes.forEach(node => {
  if (node.name === 'Execute NN_03 (AI)') {
    node.parameters.inputData = "={\n  \"text\": \"{{ $node[\\\"Execute NN_02\\\"].json.data.text }}\",\n  \"chat_id\": {{ $node[\\\"Execute NN_02\\\"].json.data.chat_id }},\n  \"availability\": {{ $node[\\\"Lookup Availability\\\"].json }}\n}";
    node.parameters.options = { "mode": "exec" };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
