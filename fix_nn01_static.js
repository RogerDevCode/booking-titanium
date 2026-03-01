const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Final Response') {
    node.parameters.jsCode = "return [{ json: { success: true, message: 'Bypass active' } }];";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
