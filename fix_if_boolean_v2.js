const fs = require('fs');

const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.if') {
    node.typeVersion = 2;
    const oldCond = node.parameters.conditions.boolean[0];
    node.parameters.conditions = {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "strict",
        rightValue: ""
      },
      conditions: [
        {
          id: "cond_" + Math.random().toString(36).substring(7),
          leftValue: oldCond.value1,
          rightValue: true,
          operator: {
            type: "boolean",
            operation: "true",
            singleValue: true
          }
        }
      ],
      combinator: "and"
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed IF nodes v2 operator format in', filePath);
