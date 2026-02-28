const fs = require('fs');

const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const item = $input.first()?.json || {};
// In n8n v2 AI Agent returns 'output'
const ai_response = item.output || item.text || item.ai_response;
const originalData = $node["Extract & Validate (PRE)"].json;
const chat_id = originalData.chat_id || item.chat_id || "unknown";

// If we came from Format Rejection
if (item.error_code === "VALIDATION_ERROR") {
  return [{ json: item }];
}

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
    node.parameters.jsCode = `return {
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
};`;
  }
  
  if (node.name === 'Extract & Validate (PRE)') {
    node.parameters.jsCode = `const item = $input.first()?.json || {};
const data = item.data || item.body?.data || item.body || item;

const chat_id = data.chat_id;
const text = data.text || data.ai_response;

const isValid = !!(chat_id && text);

return [{
  json: {
    isValid,
    chat_id,
    text,
    original_data: data
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
