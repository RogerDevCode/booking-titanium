const fs = require('fs');

const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.if' && node.parameters.conditions && node.parameters.conditions.boolean) {
    const oldCond = node.parameters.conditions.boolean[0];
    node.parameters.conditions = {
      options: {
        caseSensitive: true,
        leftValue: "",
        rightValue: ""
      },
      conditions: [
        {
          id: node.id + "_cond",
          leftValue: oldCond.value1,
          rightValue: oldCond.value2,
          operator: "equals",
          type: "boolean"
        }
      ],
      combinator: "and"
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed IF nodes in', filePath);
