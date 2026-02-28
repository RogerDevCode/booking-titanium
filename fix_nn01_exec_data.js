const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Execute NN_02') {
    node.parameters.options = {
      "waitForSubworkflow": true,
      "mode": "passthrough" 
    };
    // To send specific data, we often use inputSource: 'expression'
    node.parameters.inputSource = 'expression';
    node.parameters.inputData = '={{ $json.raw_input }}';
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
