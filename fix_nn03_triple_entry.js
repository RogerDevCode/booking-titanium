const fs = require('fs');

const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Add Manual Trigger
const manualTrigger = {
  "parameters": {},
  "name": "Manual Trigger",
  "type": "n8n-nodes-base.manualTrigger",
  "typeVersion": 1,
  "position": [200, 240],
  "id": "manual_trigger"
};

// Add Webhook Trigger
const webhookTrigger = {
  "parameters": {
    "httpMethod": "POST",
    "path": "nn-03-ai-agent-test",
    "responseMode": "lastNode",
    "options": {}
  },
  "name": "Webhook",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 2,
  "position": [200, 600],
  "webhookId": "nn-03-ai-agent-test",
  "id": "webhook_trigger"
};

data.nodes.push(manualTrigger, webhookTrigger);

// Connect them to the first logic node (Extract & Validate (PRE))
const targetNode = "Extract & Validate (PRE)";
data.connections["Manual Trigger"] = {
  "main": [
    [
      {
        "node": targetNode,
        "type": "main",
        "index": 0
      }
    ]
  ]
};

data.connections["Webhook"] = {
  "main": [
    [
      {
        "node": targetNode,
        "type": "main",
        "index": 0
      }
    ]
  ]
};

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
