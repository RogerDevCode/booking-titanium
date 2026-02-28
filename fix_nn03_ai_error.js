const fs = require('fs');

const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.onError = "continueErrorOutput";
  }
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const item = $input.first()?.json || {};
// In n8n v2 AI Agent returns 'output'
const ai_response = item.output || item.text || item.ai_response;

// Try to get chat_id from multiple sources
let chat_id = item.chat_id;
if (!chat_id) {
  try {
    chat_id = $node["Extract & Validate (PRE)"].json.chat_id;
  } catch (e) {}
}
chat_id = chat_id || "unknown";

// If we came from Format Rejection
if (item.error_code === "VALIDATION_ERROR") {
  return [{ json: item }];
}

const isSuccess = !!ai_response && !item.error;

return [{
  json: {
    success: isSuccess,
    error_code: isSuccess ? null : "AI_AGENT_ERROR",
    error_message: isSuccess ? null : (item.error || "AI Agent failed to generate response"),
    data: {
      ai_response: ai_response || null,
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
});

// Update connections for AI Agent branch 1
data.connections["AI Agent"] = {
  "main": [
    [
      {
        "node": "Format Success (POST)",
        "type": "main",
        "index": 0
      }
    ],
    [
      {
        "node": "Format Success (POST)",
        "type": "main",
        "index": 0
      }
    ]
  ]
};

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
