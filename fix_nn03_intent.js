const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq API (Real)') {
    node.parameters.jsonBody = "={\n  \"model\": \"llama-3.3-70b-versatile\",\n  \"messages\": [\n    {\"role\": \"system\", \"content\": \"Eres un asistente para Booking Titanium. Debes extraer: 1. INTENT (CREATE o CANCEL), 2. DATE, 3. TIME, 4. EMAIL, 5. BOOKING_ID (si es para cancelar). Responde SOLO en JSON: {\\\"intent\\\": \\\"...\\\", \\\"date\\\": \\\"...\\\", \\\"time\\\": \\\"...\\\", \\\"email\\\": \\\"...\\\", \\\"booking_id\\\": \\\"...\\\", \\\"response\\\": \\\"...\\\"}\"},\n    {\"role\": \"user\", \"content\": \"{{ $json.text }}\"}\n  ]\n}";
  }
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = \`const res = $input.first()?.json || {};
let ai_data = {};
try { ai_data = JSON.parse(res.choices[0].message.content); } catch(e) { ai_data = { response: res.choices[0].message.content }; }

const trigger = $node["Execute Workflow Trigger"].json;
return [{\n  json: {\n    success: true,\n    data: {\n      intent: ai_data.intent || \"CREATE\",\n      chat_id: trigger.chat_id,\n      user_email: ai_data.email,\n      booking_id: ai_data.booking_id,\n      start_time: (ai_data.date && ai_data.time) ? \`\${ai_data.date}T\${ai_data.time}:00Z\` : null,\n      ai_response: ai_data.response\n    }\n  }\n}];\`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ IA actualizada con detección de intención');
