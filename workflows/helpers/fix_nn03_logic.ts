import * as fs from 'fs';
const p = 'workflows/NN_03-B_Pipeline_Agent.json';
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

// 1. Fix Intent Classifier Prompt
const classifierNode = data.nodes.find((n: any) => n.name === 'Intent Classifier LLM');
if (classifierNode) {
  classifierNode.parameters.text = `### INSTRUCCIÓN CRÍTICA ###
Responde ÚNICAMENTE con una de las siguientes palabras clave, sin texto adicional, sin saludos, sin explicaciones:
create_booking, cancel_booking, check_availability, find_next, get_services, general_chat.

### REGLAS DE CLASIFICACIÓN ###
- create_booking: Agendar o reservar turno.
- cancel_booking: Cancelar turno.
- check_availability: Consultar horarios de una FECHA ESPECÍFICA.
- find_next: Buscar primer turno disponible.
- get_services: Consultar qué servicios médicos, atenciones o especialidades ofrece la clínica (ej: 'qué servicios tienen', 'tienen dentista?').
- general_chat: Saludos, tarifas, dónde están ubicados, etc.

### TEXTO DEL USUARIO ###
{{ $('Rule Firewall').first().json.text }}`;
}

// 2. Fix Intent Normalizer to handle loose LLM output
const normalizerNode = data.nodes.find((n: any) => n.name === 'Intent Normalizer');
if (normalizerNode) {
  normalizerNode.parameters.jsCode = `const llmOutput = String($input.first()?.json.text || '').toLowerCase();
const allowed = ["create_booking", "cancel_booking", "check_availability", "find_next", "get_services", "general_chat"];

let intent = "general_chat";
for (const word of allowed) {
  if (llmOutput.includes(word)) {
    intent = word;
    break;
  }
}

return [{ 
  json: { 
    ...$json, 
    intent,
    raw_llm: llmOutput
  } 
}];`;
}

// 3. Replace "Merge All Branches" with a Code Node Merge
const mergeNodeIdx = data.nodes.findIndex((n: any) => n.name === 'Merge All Branches');
if (mergeNodeIdx !== -1) {
  const oldMerge = data.nodes[mergeNodeIdx];
  data.nodes[mergeNodeIdx] = {
    "parameters": {
      "jsCode": `// ROBUST MERGE (GEMINI.md §5)
const nodesToCheck = [
  "Response Gen: create_booking",
  "Response Gen: cancel_booking",
  "Response Gen: check_availability",
  "Response Gen: find_next",
  "Response Gen: get_services",
  "Response Gen: general_chat",
  "Fallback Response LLM"
];

for (const name of nodesToCheck) {
  try {
    if ($(name).isExecuted) {
      return [{ json: $(name).first().json }];
    }
  } catch (e) {}
}

return [{ json: { success: false, error_message: "No branch executed" } }];`
    },
    "id": oldMerge.id,
    "name": "Merge All Branches",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": oldMerge.position
  };
}

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('Fixed NN_03-B logic and merge');
