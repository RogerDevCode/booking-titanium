const fs = require('fs');

const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const item = $input.first()?.json || {};
// Support data coming from AI Agent or previous nodes
const ai_response = item.output || item.text || item.ai_response;
const chat_id = item.chat_id || "123456789";

return [{
  json: {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      ai_response: ai_response,
      chat_id: chat_id
    },
    _meta: {
      source: "NN_03_AI_Agent",
      timestamp: new Date().toISOString(),
      workflow_id: "NN_03",
      version: "1.0.0"
    }
  }
}];`;
  }
  
  if (node.name === 'Format Rejection') {
    node.parameters.jsCode = `return [{
  json: {
    success: false,
    error_code: "VALIDATION_ERROR",
    error_message: "Payload missing required fields for AI Agent",
    data: null,
    _meta: {
      source: "NN_03_AI_Agent",
      timestamp: new Date().toISOString(),
      workflow_id: "NN_03",
      version: "1.0.0"
    }
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
