const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.type = '@n8n/n8n-nodes-langchain.agent';
    node.typeVersion = 3.1;
    node.parameters = {
      "options": {
        "systemMessage": "Eres un asistente de reservas profesional para Booking Titanium."
      },
      "agent": "conversationalVariablesAgent",
      "promptType": "define",
      "text": "={{ $json.text }}"
    };
  }
  if (node.name === 'Groq Chat Model') {
    node.parameters.modelName = "llama-3.3-70b-versatile";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
