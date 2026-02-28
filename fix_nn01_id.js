const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Execute NN_02') {
    node.parameters.workflowId.value = "Hp7ox7JqRwVA5wr8";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
