const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Telegram') {
    // When Telegram fails but is set to continueErrorOutput, the output doesn't match the
    // structure expected by the "Format Success (POST)" logic.
    // Instead of continueErrorOutput, we might just want to let it fail, OR fix the test
    node.onError = "continueErrorOutput";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
