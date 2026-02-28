const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Is Valid?') {
    node.typeVersion = 1;
    node.parameters.conditions = {
      boolean: [
        {
          value1: "={{ $json.isValid }}",
          value2: true
        }
      ]
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed Is Valid? node in NN_04 to v1 (to avoid the weird error fallback bug)');
