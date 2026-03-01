const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Extract & Validate (PRE)') {
    node.parameters.jsCode = `/* STRICT VALIDATION */
const item = $input.first()?.json || {};
const data = item.data || item.body?.data || item.body || item;

const chat_id = data.chat_id;
const text = data.text || data.ai_response;

const isValid = !!(chat_id && text && text.length > 2);

if (!isValid) {
  return [{
    json: {
      success: false,
      isValid: false,
      error_code: "VALIDATION_ERROR",
      error_message: "Payload missing required fields for AI Agent",
      _meta: { source: "NN_03_AI_Agent", timestamp: new Date().toISOString() }
    }
  }];
}

return [{
  json: {
    isValid: true,
    chat_id,
    text,
    original_data: data
  }
}];`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ Validador de NN_03 actualizado');
