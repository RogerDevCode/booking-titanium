const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const telegramResult = $input.first()?.json || {};
// Fallback if telegram doesn't return chat
const chat_id = telegramResult.chat?.id || $node["Extract & Validate (PRE)"].json.chat_id || "unknown";

return [{
  json: {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      delivery_status: "SENT",
      chat_id: chat_id,
      message_id: telegramResult.message_id
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
console.log('Fixed Format Success node in NN_04 to include chat_id correctly');
