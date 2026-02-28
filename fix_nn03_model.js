const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq Chat Model') {
    // Standard Groq model name in n8n
    node.parameters.modelName = "llama-3.3-70b-versatile";
  }
  if (node.name === 'AI Agent') {
    // Ensure agent type is set (default is often conversational)
    node.parameters.agent = "conversationalVariablesAgent";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
