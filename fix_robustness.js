const fs = require('fs');

// Fix NN_02
const wf02 = JSON.parse(fs.readFileSync('workflows/NN_02_Message_Parser.json', 'utf8'));
wf02.nodes.forEach(node => {
  if (node.name === 'Extract & Validate (PRE)') {
    node.parameters.jsCode = `/* ROBUST VERSION */
const input = $input.first()?.json;
// Support: raw_input (from NN_01), body (from direct webhook), or root
const data = input?.raw_input || input?.body || input || {};

// Support: message object (Telegram), or direct fields
const message = data.message || data.channel_post || data;

const chat_id = message.chat?.id || data.chat_id;
const text = message.text || data.text;

if (!chat_id || !text) {
  return [{
    json: {
      success: false,
      error_code: "VALIDATION_ERROR",
      error_message: "Payload missing required 'chat_id' or 'text' fields.",
      debug_received: input,
      data: null,
      _meta: { source: "NN_02_Message_Parser", timestamp: new Date().toISOString(), version: "1.0.0" }
    }
  }];
}

const username = message.from?.first_name || message.chat?.first_name || data.username || "Unknown";

// Standard Contract Output
return [{
  json: {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      chat_id: chat_id,
      text: text.replace(/'/g, "''").substring(0, 500),
      username: username.replace(/'/g, "''").substring(0, 100),
      type: "text"
    },
    _meta: { source: "NN_02_Message_Parser", timestamp: new Date().toISOString(), version: "1.0.0" }
  }
}];`;
  }
});
fs.writeFileSync('workflows/NN_02_Message_Parser.json', JSON.stringify(wf02, null, 2));

// Fix NN_03
const wf03 = JSON.parse(fs.readFileSync('workflows/NN_03_AI_Agent.json', 'utf8'));
wf03.nodes.forEach(node => {
  if (node.name === 'Extract & Validate (PRE)') {
    node.parameters.jsCode = `const input = $input.first()?.json;
const data = input?.nn02_data || input?.data || input || {};

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
  if (node.name === 'AI Agent') {
    node.parameters.text = '={{ $json.text }}';
    node.parameters.options = {
      "systemMessage": "Eres un asistente de reservas para el sistema Booking Titanium. Ayuda al usuario con su petición: {{ $json.text }}. Chat ID: {{ $json.chat_id }}"
    };
  }
});
fs.writeFileSync('workflows/NN_03_AI_Agent.json', JSON.stringify(wf03, null, 2));

// Fix NN_01
const wf01 = JSON.parse(fs.readFileSync('workflows/NN_01_Booking_Gateway.json', 'utf8'));
wf01.nodes.forEach(node => {
  if (node.name === 'Execute NN_02') {
    node.parameters.inputSource = 'passthrough';
    delete node.parameters.inputData;
  }
  if (node.name === 'Execute NN_03 (AI)') {
    node.parameters.inputSource = 'passthrough';
    delete node.parameters.inputData;
  }
});
fs.writeFileSync('workflows/NN_01_Booking_Gateway.json', JSON.stringify(wf01, null, 2));

console.log('Applied robustness fixes to NN_01, NN_02 and NN_03');
