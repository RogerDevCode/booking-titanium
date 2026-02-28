const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Execute NN_02') {
    node.parameters.inputSource = 'expression';
    node.parameters.inputData = '={{ $json.raw_input }}';
  }
  if (node.name === 'Execute NN_03 (AI)') {
    node.parameters.inputSource = 'expression';
    node.parameters.inputData = '={{ $json.nn02_data }}';
  }
  if (node.name === 'Execute NN_04 (Telegram)') {
    node.parameters.inputSource = 'expression';
    node.parameters.inputData = '={{ $json }}';
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
