const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const ID_MAP = {
  "Execute NN_02": "Hp7ox7JqRwVA5wr8",
  "Execute NN_03 (AI)": "N2APxPodLDJCG818",
  "Execute NN_04 (Telegram)": "4afRuMkIvgEh7gXt",
  "Execute GCAL": "bc8zMLI9O5ytO7a2",
  "Execute GMAIL": "pJmPTUO09YxJiqvb"
};

data.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.executeWorkflow') {
    const targetId = ID_MAP[node.name];
    if (targetId) {
      node.parameters.workflowId = {
        "__rl": true,
        "value": targetId,
        "mode": "id"
      };
    }
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ IDs de Sub-workflows sincronizados en NN_01');
