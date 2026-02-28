const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Remove Failed Memory Node from previous attempt
data.nodes = data.nodes.filter(n => n.type !== '@n8n/n8n-nodes-langchain.memoryWindowBuffer');

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.parameters = {
      "promptType": "define",
      "text": "={{ $json.text }}",
      "options": {
        "systemMessage": "Eres un asistente de reservas. Responde al usuario de forma breve."
      }
    };
    // Let n8n choose the default agent type
  }
  if (node.name === 'Groq Chat Model') {
    node.parameters.modelName = "llama3-8b-8192";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
