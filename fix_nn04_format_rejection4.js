const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Is Valid?') {
    node.typeVersion = 2;
    node.parameters.conditions = {
      options: {
        typeValidation: "strict"
      },
      conditions: [
        {
          id: "cond_valid_tg",
          leftValue: "={{ $json.isValid }}",
          rightValue: true,
          operator: {
            type: "boolean",
            operation: "true",
            singleValue: true
          }
        }
      ],
      combinator: "and"
    };
  }
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
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const telegramResult = $input.first()?.json || {};
// Fallback if telegram doesn't return chat
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
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
