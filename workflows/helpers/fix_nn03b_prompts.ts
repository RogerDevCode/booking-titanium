import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'NN_03-B_Pipeline_Agent.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

for (const node of data.nodes) {
    // 1. Corregir Prompt de Generación de Respuesta (Extraer de $json.data.documents)
    if (node.name === "Response Gen: get_services") {
        node.parameters.text = "=\"Eres la recepcionista virtual de la clínica Booking Titanium. Tu objetivo es informar al usuario sobre nuestros servicios basándote EXCLUSIVAMENTE en los documentos adjuntos.\\n\\nDOCUMENTOS RECUPERADOS:\\n\" + JSON.stringify($json.data?.documents || []) + \"\\n\\nCONSULTA DEL USUARIO:\\n\" + $('Rule Firewall').first().json.text + \"\\n\\nREGLAS DE RESPUESTA:\\n1. Responde en ESPAÑOL.\\n2. Sé amable y profesional.\\n3. Si no encuentras la información en los documentos, indica que no tienes esa información específica y ofrece comunicar al usuario con un operador humano.\\n4. No menciones que eres una IA o que estás leyendo documentos.\"";
    }
    
    // 2. Corregir Prompt de Fallback/General (Asegurar que no intente leer JSON inexistente)
    if (node.name === "Fallback Response LLM") {
        node.parameters.text = "=\"Eres la recepcionista virtual de la clínica Booking Titanium. Responde amablemente al usuario.\\n\\nMENSAJE DEL USUARIO:\\n\" + $('Rule Firewall').first().json.text + \"\\n\\nINSTRUCCIÓN:\\nSi es un saludo, devuélvelo y pregunta en qué puedes ayudar. Si es una duda general no médica, intenta ayudar con cortesía en máximo 2 oraciones.\"";
    }
}

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('✅ Prompts de NN_03-B actualizados.');
