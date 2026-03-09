import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'NN_03-B_Pipeline_Agent.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

const finalOutputNode = "📤 Standard Contract Output";

// 1. Forzar redirección de Errores al final (H03)
data.connections["Format Validation Error"] = { "main": [[{ "node": finalOutputNode, "type": "main", "index": 0 }]] };
data.connections["Format Security Error"] = { "main": [[{ "node": finalOutputNode, "type": "main", "index": 0 }]] };

// 2. Corregir Prompt de Respuesta RAG para que lea la estructura real de RAG_02
const respNode = data.nodes.find((n: any) => n.name === "Response Gen: get_services");
if (respNode) {
    respNode.parameters.text = "=\"Eres la recepcionista de la clínica Booking Titanium. Tu objetivo es informar sobre servicios usando la INFORMACIÓN RECUPERADA abajo.\\n\\nINFORMACIÓN RECUPERADA (RAG):\\n\" + JSON.stringify($json.data?.documents || []) + \"\\n\\nUSUARIO: \" + $('Rule Firewall').first().json.text + \"\\n\\nREGLAS:\\n1. Responde en ESPAÑOL.\\n2. Usa SOLO la información arriba. Si no está la especialidad, indícalo amablemente.\\n3. No menciones el formato JSON ni tecnicismos.\"";
}

// 3. Corregir el nodo Formatter Final para que no confunda GENERAL con get_services
const formatterNode = data.nodes.find((n: any) => n.name === "Format Response");
if (formatterNode) {
    formatterNode.parameters.jsCode = formatterNode.parameters.jsCode.replace(
        "intent: input.intent || \"GENERAL\",",
        "intent: input.intent || $('Intent Normalizer').first().json.intent || \"GENERAL\","
    );
}

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('✅ Fixes finales aplicados.');
