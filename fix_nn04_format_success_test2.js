const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const telegramResult = $input.first()?.json || {};
const originalData = $item(0).$node["Extract & Validate (PRE)"].json;
const chat_id = telegramResult.chat?.id || originalData.chat_id || "unknown";

return [{
  json: {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      delivery_status: "SENT",
      chat_id: chat_id,
      message_id: telegramResult.message_id || null
    },
    _meta: {
      source: "NN_04_Telegram_Sender",
      timestamp: new Date().toISOString(),
      workflow_id: "NN_04",
      version: "1.0.0"
    }
  }
}];`;
  }
  
  if (node.name === 'Extract & Validate (PRE)') {
     node.parameters.jsCode = `const item = $input.first()?.json || {};
const data = item.data || item.body?.data || item.body || item;

// Support both 'text' and 'ai_response' fields
const chat_id = data.chat_id;
const text = data.text || data.ai_response;

// Validation Sandwich PRE: Check required fields
const isValid = !!(chat_id && text);

return [{
  json: {
    isValid,
    chat_id: chat_id,
    text: text,
    ai_response: text,
    original_data: data
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
