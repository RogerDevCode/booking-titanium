import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'NN_03-B_Pipeline_Agent.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

const classifier = data.nodes.find((n: any) => n.name === "Intent Classifier LLM");
classifier.parameters.text = "Clasifica el mensaje del usuario en una de estas categorías.\n\nCATEGORÍAS:\n- get_services: El usuario pregunta por especialidades médicas, servicios, doctores, o qué atenciones brindan (Ej: cardiología, pediatría, nutrición).\n- general_chat: Saludos, agradecimientos o ubicación.\n\nREGLA: Si menciona una especialidad médica, responde SIEMPRE 'get_services'.\n\nMENSAJE: {{ $('Rule Firewall').first().json.text }}\n\nRespuesta (Solo una palabra):";

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('✅ Clasificador corregido.');
