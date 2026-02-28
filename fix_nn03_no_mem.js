const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

delete data.connections["Window Buffer Memory"];

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.parameters = {
      "options": {},
      "agent": "conversationalVariablesAgent",
      "promptType": "define",
      "text": "={{ $json.text }}"
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
