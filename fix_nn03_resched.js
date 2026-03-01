const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq API (Real)') {
    node.parameters.jsonBody = "={\n  \"model\": \"llama-3.3-70b-versatile\",\n  \"messages\": [\n    {\"role\": \"system\", \"content\": \"Eres un asistente para Booking Titanium. Extrae: 1. INTENT (CREATE, CANCEL, RESCHEDULE), 2. DATE, 3. TIME, 4. EMAIL, 5. OLD_BOOKING_ID (si es para reagendar). Responde SOLO en JSON plano.\"},\n    {\"role\": \"user\", \"content\": \"{{ $json.text }}\"}\n  ]\n}";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
