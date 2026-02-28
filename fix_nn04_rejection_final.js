const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = `const telegramResult = $input.first()?.json || {};
const originalData = $node["Extract & Validate (PRE)"].json;
const chat_id = telegramResult.chat?.id || originalData.chat_id || "unknown";

// If we came from Format Rejection, it already has success: false and VALIDATION_ERROR
if (telegramResult.error_code === "VALIDATION_ERROR") {
  return [{ json: telegramResult }];
}

const isSuccess = !!telegramResult.message_id && !telegramResult.error;

return [{
  json: {
    success: isSuccess,
    error_code: isSuccess ? null : "TELEGRAM_API_ERROR",
    error_message: isSuccess ? null : (telegramResult.error || "Telegram failed to send message"),
    data: {
      delivery_status: isSuccess ? "SENT" : "FAILED",
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
  
  if (node.name === 'Format Rejection') {
    // Return just the object, since it connects to a Code node
    node.parameters.jsCode = `return {
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
};`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
