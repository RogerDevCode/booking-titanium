const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Añadir nodo Set Context v3.4
const setContextNode = {
  "parameters": {
    "assignments": {
      "assignments": [
        { "id": "text", "name": "text", "value": "={{ $node[\"Execute NN_02\"].json.data.text }}", "type": "string" },
        { "id": "chat_id", "name": "chat_id", "value": "={{ $node[\"Execute NN_02\"].json.data.chat_id }}", "type": "number" },
        { "id": "avail_date", "name": "avail_date", "value": "={{ $node[\"Lookup Availability\"].json.date }}", "type": "string" },
        { "id": "slots", "name": "slots", "value": "={{ $node[\"Lookup Availability\"].json.slots }}", "type": "array" }
      ]
    },
    "options": {}
  },
  "name": "Prepare AI Input",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.4,
  "position": [250, 432],
  "id": "prepare_ai"
};

data.nodes.push(setContextNode);

// Re-conectar
data.connections["Lookup Availability"].main[0] = [{ "node": "Prepare AI Input", "type": "main", "index": 0 }];
data.connections["Prepare AI Input"] = { "main": [[{ "node": "Execute NN_03 (AI)", "type": "main", "index": 0 }]] };

// Limpiar Execute NN_03
data.nodes.forEach(node => {
  if (node.name === 'Execute NN_03 (AI)') {
    node.parameters.options = { "mode": "passthrough" };
    delete node.parameters.inputData;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
