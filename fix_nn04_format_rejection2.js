const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Rejection') {
    node.parameters.jsCode = `return [{
  json: {
    success: false,
    error_code: "VALIDATION_ERROR",
    error_message: "Payload missing required fields for Telegram",
    data: null,
    _meta: {
      source: "NN_04_Telegram_Sender",
      timestamp: new Date().toISOString(),
      workflow_id: "NN_04",
      version: "1.0.0"
    }
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed Format Rejection node in NN_04 to match test exactly');
