import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'NN_03-B_Pipeline_Agent.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

// Modificar el clasificador para que sea más agresivo con get_services
const classifier = data.nodes.find((n: any) => n.name === "Intent Classifier LLM");
classifier.parameters.text = "Clasifica el mensaje del usuario.\n\nINTENCIONES:\n- get_services: Si menciona especialidades médicas (cardiología, pediatría, etc) o pregunta que hacen o que doctores hay.\n- general_chat: Saludos o ubicación.\n\nUSUARIO: {{ $('Rule Firewall').first().json.text }}\n\nResponde SOLO la palabra de la intención.";

// Corregir el prompt de Response Gen para forzar el uso de la data inyectada
const responseGen = data.nodes.find((n: any) => n.name === "Response Gen: get_services");
responseGen.parameters.text = "=\"Eres la recepcionista de Booking Titanium. RESPONDE SIEMPRE USANDO LA INFORMACIÓN DE LOS DOCUMENTOS ABAJO.\\n\\nDOCUMENTOS RECUPERADOS:\\n\" + JSON.stringify($json.data?.documents || []) + \"\\n\\nCONSULTA: \" + $('Rule Firewall').first().json.text + \"\\n\\nREGLA: Si en los documentos dice que hay Cardiología, dí que sí hay y detalla los servicios mencionados en el texto recuperado.\"";

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('✅ Lógica RAG ajustada.');
