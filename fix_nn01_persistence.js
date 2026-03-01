const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 1. Modificar el nodo Format Success para que use los datos correctos
// Y asegurar que los nodos Execute GCAL y Execute GMAIL reciban TODO el contexto.
data.nodes.forEach(node => {
  if (node.name === 'Execute GCAL' || node.name === 'Execute GMAIL') {
    // Forzamos que pasen todos los datos de los nodos anteriores
    node.parameters.options = {
      "waitForSubworkflow": true,
      "mode": "passthrough"
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ Persistencia de datos mejorada en NN_01');
