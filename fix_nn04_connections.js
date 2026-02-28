const fs = require('fs');

const filePath = 'workflows/NN_04_Telegram_Sender.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// The Telegram node in v2 with "On Error -> Continue" outputs data on branch 1 (index 1)
// not branch 0 if it fails. Let's fix the connection to capture both or just handle the error branch.
data.connections["Telegram"] = {
  "main": [
    [
      {
        "node": "Format Success (POST)",
        "type": "main",
        "index": 0
      }
    ],
    [
      {
        "node": "Format Success (POST)",
        "type": "main",
        "index": 0
      }
    ]
  ]
};

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
