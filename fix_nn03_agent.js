const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.parameters.promptType = 'define';
    node.parameters.text = '={{ $json.text }}';
    node.parameters.options = {
      "systemMessage": "Eres un asistente de reservas para el sistema Booking Titanium. Tu objetivo es ayudar a los usuarios a realizar reservas de forma amable y eficiente. Los datos del usuario son: Chat ID: {{ $json.chat_id }}. Mensaje: {{ $json.text }}"
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
