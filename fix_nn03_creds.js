const fs = require('fs');

const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq Chat Model') {
    node.credentials = {
      "groqApi": {
        "id": "4S8GVMY7aotYd9BI",
        "name": "Groq account"
      }
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
