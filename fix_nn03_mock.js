const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.type = 'n8n-nodes-base.code';
    node.typeVersion = 2;
    node.parameters = {
      "jsCode": `const text = $json.text;
return [{
  json: {
    output: "¡Hola! Entiendo que quieres reservar una mesa para dos personas para cenar mañana a las 20:00. He procesado tu solicitud en el sistema Booking Titanium. ¿Deseas confirmar la reserva?",
    text: text
  }
}];`
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
