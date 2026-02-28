const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.executeWorkflow' && node.typeVersion === 1.3) {
    const wfId = node.parameters.workflowId;
    if (typeof wfId === 'string') {
      node.parameters.workflowId = {
        "__rl": true,
        "value": wfId,
        "mode": "id"
      };
    }
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
