const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Find and replace model node
data.nodes.forEach(node => {
  if (node.name === 'Groq Chat Model') {
    node.type = '@n8n/n8n-nodes-langchain.lmChatOpenAI';
    node.typeVersion = 1;
    node.parameters = {
      "model": "llama-3.3-70b-versatile",
      "options": {
        "baseURL": "https://api.groq.com/openai/v1"
      }
    };
    // We still use the same credential ID because it has the right format (ApiKey header)
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
