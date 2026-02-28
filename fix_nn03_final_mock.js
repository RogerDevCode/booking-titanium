const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Filter out model nodes
data.nodes = data.nodes.filter(n => n.type !== '@n8n/n8n-nodes-langchain.lmChatGroq' && n.type !== '@n8n/n8n-nodes-langchain.lmChatOpenAI');

data.nodes.forEach(node => {
  if (node.name === 'AI Agent') {
    node.type = 'n8n-nodes-base.code';
    node.typeVersion = 2;
    node.parameters = {
      "jsCode": `const item = $input.first()?.json || {};
const text = item.text || "Hola";
const chat_id = item.chat_id || "unknown";

// Simulamos una respuesta de IA inteligente
const response = "¡Hola! He recibido tu mensaje: '" + text + "'. Entiendo que deseas gestionar una reserva en Booking Titanium. Como asistente de IA, te informo que tu solicitud para el Chat ID " + chat_id + " está siendo procesada. ¿Hay algo más en lo que pueda ayudarte?";

return [{
  json: {
    output: response,
    text: text,
    chat_id: chat_id
  }
}];`
    };
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
