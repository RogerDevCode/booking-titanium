const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq Chat Model') {
    node.parameters.modelName = "llama-3.1-8b-instant";
  }
  if (node.name === 'AI Agent') {
    node.parameters = {
      "promptType": "define",
      "text": "={{ $json.text }}",
      "options": {}
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
