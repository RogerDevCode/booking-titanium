const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq Chat Model') {
    node.parameters.options = {
      "temperature": 0.7
    };
  }
  if (node.name === 'AI Agent') {
    node.parameters.agent = "conversationalVariablesAgent";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
