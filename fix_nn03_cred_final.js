const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq API (Real)') {
    node.credentials = {
      "httpHeaderAuth": {
        "id": "2Q3kWX8PH6YGd7Ll",
        "name": "Groq Header API"
      }
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
