const fs = require('fs');

const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.if') {
    // Restaurar a typeVersion 1 que es más estable con booleanos
    node.typeVersion = 1;
    
    // Convertir de nuevo al formato v1
    const oldCond = node.parameters.conditions.conditions[0];
    node.parameters.conditions = {
      boolean: [
        {
          value1: oldCond.leftValue,
          value2: true
        }
      ]
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Fixed IF nodes format back to v1 in', filePath);
