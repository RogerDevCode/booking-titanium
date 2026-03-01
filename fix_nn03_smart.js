const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Groq API (Real)') {
    node.parameters.jsonBody = "={\n  \"model\": \"llama-3.3-70b-versatile\",\n  \"messages\": [\n    {\"role\": \"system\", \"content\": \"Eres un asistente para Booking Titanium. REGLA DE ORO: Si el usuario pide una fecha y en el CONTEXTO DE DISPONIBILIDAD sale que no hay o hay otros días, sugiere proactivamente los slots disponibles que te pasamos. CONTEXTO DISPONIBILIDAD: {{ JSON.stringify($node[\\\"Execute Workflow Trigger\\\"].json.availability) }}\"},\n    {\"role\": \"user\", \"content\": \"{{ $json.text }}\"}\n  ]\n}";
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
