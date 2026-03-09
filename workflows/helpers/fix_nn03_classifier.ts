import * as fs from 'fs';
const p = 'workflows/NN_03-B_Pipeline_Agent.json';
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

const classifierNode = data.nodes.find((n: any) => n.name === 'Intent Classifier LLM');
classifierNode.parameters.text = `### INSTRUCCIÓN DE CLASIFICACIÓN ###
Responde ÚNICAMENTE con una palabra clave.

INTENCIONES:
- get_services: El usuario pregunta sobre especialidades, médicos, servicios médicos, qué hacen en la clínica, qué doctores hay, etc. (Ej: "¿Tienen cardiología?", "¿Qué servicios ofrecen?", "¿Atienden niños?")
- create_booking: El usuario quiere AGENDAR, RESERVAR o SACAR un turno.
- cancel_booking: El usuario quiere CANCELAR un turno.
- check_availability: Consulta de horarios para una fecha.
- find_next: Primer turno disponible.
- general_chat: Saludos, agradecimientos, ubicación física, precios/tarifas generales.

TEXTO DEL USUARIO:
{{ $('Rule Firewall').first().json.text }}`;

fs.writeFileSync(p, JSON.stringify(data, null, 2));
