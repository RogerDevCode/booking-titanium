import * as fs from 'fs';

const p = 'workflows/DB_Cancel_Booking.json';
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

data.nodes.push({
  "parameters": {},
  "id": "trigger_manual_123",
  "name": "Manual Trigger",
  "type": "n8n-nodes-base.manualTrigger",
  "typeVersion": 1,
  "position": [0, 220]
});

data.connections["Manual Trigger"] = {
  "main": [
    [
      {
        "node": "Validate UUID",
        "type": "main",
        "index": 0
      }
    ]
  ]
};

fs.writeFileSync(p, JSON.stringify(data, null, 2));
