const fs = require('fs');
const filePath = 'workflows/NN_01_Booking_Gateway.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 1. Añadir nodo de Contexto
const contextNode = {
  "parameters": {
    "keepOnlySet": false,
    "values": {
      "string": [
        { "name": "final_email", "value": "={{ $node[\"Execute NN_03 (AI)\"].json.data.user_email || 'baba.orere@gmail.com' }}" },
        { "name": "final_name", "value": "={{ $node[\"Execute NN_02\"].json.data.username || 'Paciente' }}" }
      ]
    },
    "options": {}
  },
  "name": "Set Final Context",
  "type": "n8n-nodes-base.set",
  "typeVersion": 3.2,
  "position": [2300, 200],
  "id": "set_context"
};

data.nodes.push(contextNode);

// 2. Actualizar GMAIL para usar el nuevo contexto
data.nodes.forEach(node => {
  if (node.name === 'GMAIL_Send_Confirmation') {
     // Modificaremos el workflow GMAIL por separado, aqui solo actualizamos la llamada en NN_01 si fuera necesario.
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('✅ Estructura Singleton preparada');
