const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Desactivamos passthrough en pasos criticos para evitar 500 por sobrecarga de JSON
data.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.executeWorkflow') {
    node.parameters.options = {
      "waitForSubworkflow": true,
      "mode": "exec" // 'exec' es mas limpio que 'passthrough' para flujos largos
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
