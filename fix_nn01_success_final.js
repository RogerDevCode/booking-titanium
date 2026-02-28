const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success') {
    node.parameters.jsCode = `// Final response - Success
const nn03 = $node["Check NN_03 Result"].json;
const nn04 = $input.first()?.json || {};

return [{
  json: {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      message_sent: nn04.success === true,
      chat_id: nn03.chat_id,
      ai_response: nn03.ai_response
    },
    _meta: {
      source: "NN_01_Booking_Gateway",
      timestamp: new Date().toISOString(),
      workflow_id: "NN_01",
      version: "1.1.0"
    }
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
