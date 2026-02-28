const fs = require('fs');

const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.if' && node.parameters.conditions && node.parameters.conditions.options) {
    // Remove options that cause strict comparison to fail
    delete node.parameters.conditions.options.caseSensitive;
    delete node.parameters.conditions.options.leftValue;
    delete node.parameters.conditions.options.rightValue;
    node.parameters.conditions.options.typeValidation = "strict";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed IF nodes type validation in', filePath);
