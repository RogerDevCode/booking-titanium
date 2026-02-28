import axios from 'axios';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/nn-01-booking-gateway-test';

const edgeCases = [
    { name: "Ortografía Atroz", text: "Kiero una hbittacion pa hoy mñn o nose kndo" },
    { name: "Basura / Sin Sentido", text: "---....,,,,;;;;::::!!!!!" },
    { name: "Incongruencia Total", text: "Hola quiero reservar para ayer a las 25:00 horas para -3 personas" }
];

async function runStressTests() {
    console.log("🚀 Iniciando Test de Estrés Semántico (Casos Límite)\n");
    
    for (const test of edgeCases) {
        console.log(`--- Prueba: ${test.name} ---`);
        console.log(`Input: "${test.text}"`);
        
        try {
            const response = await axios.post(WEBHOOK_URL, {
                message: {
                    chat: { id: 5391760292 },
                    text: test.text
                }
            }, { timeout: 30000 });

            console.log(`Respuesta IA: "${response.data.data.ai_response}"`);
        } catch (error: any) {
            console.log(`Error: ${error.message}`);
        }
        console.log("\n");
    }
}

runStressTests();
