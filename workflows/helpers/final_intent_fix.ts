import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'NN_03-B_Pipeline_Agent.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

const classifier = data.nodes.find((n: any) => n.name === "Intent Classifier LLM");
classifier.parameters.text = "Clasifica el mensaje del usuario.\n\nCATEGORÍAS:\n- get_services: El usuario pregunta por servicios médicos o doctores.\n- general_chat: Otros temas.\n\nMENSAJE: {{ $json.text }}\n\nResponde SOLO la categoría.";

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('✅ Clasificador corregido (final).');
