const fs = require('fs');

const filePath = 'workflows/NN_01_Test_Simple.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Add Manual Trigger and Execute Workflow Trigger
const manualTrigger = {
  "parameters": {},
  "name": "Manual Trigger",
  "type": "n8n-nodes-base.manualTrigger",
  "typeVersion": 1,
  "position": [200, 100],
  "id": "manual_trigger"
};

const execTrigger = {
  "parameters": {
    "inputSource": "passthrough"
  },
  "name": "Execute Workflow Trigger",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1.1,
  "position": [200, 500],
  "id": "exec_trigger"
};

data.nodes.push(manualTrigger, execTrigger);

// Connect them to Execute NN_02
data.connections["Manual Trigger"] = {
  "main": [
    [
      {
        "node": "Execute NN_02",
        "type": "main",
        "index": 0
      }
    ]
  ]
};

data.connections["Execute Workflow Trigger"] = {
  "main": [
    [
      {
        "node": "Execute NN_02",
        "type": "main",
        "index": 0
      }
    ]
  ]
};

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed Triple Entry for NN_01_Test_Simple in', filePath);
