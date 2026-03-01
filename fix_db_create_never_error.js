const fs = require('fs');
const filePath = 'workflows/DB_Create_Booking.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Call DAL Create') {
    node.parameters.options = {
      "neverError": true,
      "responseFormat": "json"
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ DB_Create_Booking configurado en modo Never Error');
