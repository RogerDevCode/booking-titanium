const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Execute NN_03 (AI)') {
    // Usamos el modo nativo de n8n para pasar datos sin stringificar
    node.parameters.options = {
      "mode": "exec" 
    };
    node.parameters.inputData = "={\n  \"text\": \"{{ $node[\\\"Execute NN_02\\\"].json.data.text }}\",\n  \"chat_id\": {{ $node[\\\"Execute NN_02\\\"].json.data.chat_id }},\n  \"availability_date\": \"{{ $node[\\\"Lookup Availability\\\"].json.date }}\",\n  \"available_slots\": {{ JSON.stringify($node[\\\"Lookup Availability\\\"].json.slots) }}\n}";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
