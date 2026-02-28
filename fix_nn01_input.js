const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Validate Input (PRE)') {
    node.parameters.jsCode = `// Get raw input from webhook
// n8n Webhook passes data in $json, often inside 'body' if it's production
const inputItem = $input.first()?.json || {};
const rawInput = inputItem.body || inputItem;

// Check if this looks like a Telegram message
const message = rawInput.message || rawInput.channel_post || {};
const chat_id = message.chat?.id;
const text = message.text;

// If no message structure found, this is an invalid payload
if (!chat_id || !text) {
  return [{
    json: {
      isValid: false,
      error_code: "INVALID_PAYLOAD",
      error_message: "Missing chat_id or text in Telegram payload",
      debug_received: inputItem
    }
  }];
}

// Valid payload - pass to NN_02
return [{
  json: {
    isValid: true,
    raw_input: rawInput
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
