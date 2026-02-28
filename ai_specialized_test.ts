import axios from 'axios';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/nn-01-booking-gateway-test';

const testCases = [
    { name: "Saludo", text: "Hola, ¿quién eres y qué puedes hacer?" },
    { name: "Reserva Simple", text: "Quiero una mesa para 4 personas este viernes a las 9pm." },
    { name: "Consulta de Negocio", text: "¿Cuáles son las ventajas de usar Booking Titanium frente a otros sistemas?" },
    { name: "Fuera de Contexto", text: "¿Cuál es la capital de Francia?" }
];

async function runTests() {
    console.log("🚀 Iniciando Test Especializado de IA (100% Real)\n");
    
    for (const test of testCases) {
        console.log(`--- Caso: ${test.name} ---`);
        console.log(`Pregunta: "${test.text}"`);
        
        try {
            const response = await axios.post(WEBHOOK_URL, {
                message: {
                    chat: { id: 5391760292 },
                    text: test.text
                }
            }, { timeout: 30000 });

            const data = response.data;
            if (data.success) {
                // In NN_01, the AI response comes from NN_03 which we mapped to ai_response
                // Note: Currently NN_01 returns its own 'data' object which might not bubble up the ai_response directly
                // Let's check where it is.
                console.log(`Respuesta IA: "${data.data.ai_response || "No se capturó ai_response en el nodo final de NN_01"}"`);
            } else {
                console.log(`Error: ${data.error_message}`);
            }
        } catch (error: any) {
            console.log(`Fallo en la petición: ${error.message}`);
        }
        console.log("\n");
    }
}

runTests();
