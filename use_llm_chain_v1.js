const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.type = '@n8n/n8n-nodes-langchain.chainLlm';
    node.typeVersion = 1;
    node.parameters = {
      "promptType": "define",
      "text": "={{ $json.text }}"
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
