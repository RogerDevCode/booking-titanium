const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq API (Real)') {
    node.parameters.jsonBody = "={\n  \"model\": \"llama-3.3-70b-versatile\",\n  \"messages\": [\n    {\"role\": \"system\", \"content\": \"Eres un extractor de datos para Booking Titanium. Tu única misión es extraer: 1. FECHA (YYYY-MM-DD), 2. HORA (HH:mm), 3. EMAIL. Responde SOLO en JSON plano: {\\\"date\\\": \\\"...\\\", \\\"time\\\": \\\"...\\\", \\\"email\\\": \\\"...\\\", \\\"response\\\": \\\"...\\\"}\"},\n    {\"role\": \"user\", \"content\": \"{{ $json.text }}\"}\n  ]\n}";
  }
  if (node.name === 'Format Success (POST)') {
    node.parameters.jsCode = \`const res = $input.first()?.json || {};
let ai_data = {};
try {
  ai_data = JSON.parse(res.choices[0].message.content);
} catch(e) {
  ai_data = { response: res.choices[0].message.content };
}

const chat_id = $node["Execute Workflow Trigger"].json.chat_id;
const start_time = (ai_data.date && ai_data.time) ? \`\${ai_data.date}T\${ai_data.time}:00Z\` : "2026-03-02T14:00:00Z";

return [{
  json: {
    success: true,
    data: {
      chat_id: chat_id,
      user_email: ai_data.email || "baba.orere@gmail.com",
      start_time: start_time,
      ai_response: ai_data.response || "Tu reserva ha sido procesada."
    }
  }
}];\`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
