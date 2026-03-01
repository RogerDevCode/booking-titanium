const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name.includes('GCAL') || node.name.includes('GMAIL') || node.name.includes('Telegram Notify')) {
    node.continueOnFail = true;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ NN_01 ahora es resiliente a fallos de servicios externos');
