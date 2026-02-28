const fs = require('fs');
const filePath = 'workflows/NN_02_Message_Parser.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Extract & Validate (PRE)') {
    node.parameters.jsCode = `/* DEBUG VERSION */
const input = $input.first()?.json;
const raw = input?.body || input || {};
const message = raw.message || raw.channel_post || {};

const chat_id = message.chat?.id;
const text = message.text;

if (!chat_id || !text) {
  return [{
    json: {
      success: false,
      error_code: "VALIDATION_ERROR",
      error_message: "Payload missing required 'chat_id' or 'text' fields.",
      debug_received: input,
      data: null,
      _meta: {
        source: "NN_02_Message_Parser",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      }
    }
  }];
}

const username = message.from?.first_name || message.chat?.first_name || "Unknown";
return [{
  json: {
    success: true,
    data: { chat_id, text, username },
    _meta: { source: "NN_02_Message_Parser", timestamp: new Date().toISOString() }
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
