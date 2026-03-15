import axios from 'axios';

const GATEWAY_URL = 'https://n8n.stax.ink/webhook/nn-01-booking-gateway';
const ADMIN_CHAT_ID = 5391760292;

interface TestResult {
  question: string;
  success: boolean;
  intent: string;
  response: string;
  elapsed: number;
}

const QUESTIONS = [
  "Hola, ¿qué servicios de cardiología tienen?",
  "¿Atienden a niños recién nacidos?",
  "¿Qué prepagas aceptan? ¿Trabajan con OSDE?",
  "¿Tienen estacionamiento en la clínica?",
  "¿Puedo pagar mi consulta en efectivo?",
  "¿Cómo hago para cancelar un turno?",
  "¿Atienden urgencias los domingos?",
  "¿Tienen telemedicina o videollamadas?",
  "¿Dónde puedo ver mis resultados de laboratorio?",
  "¿Cuáles son los requisitos para viajar al exterior?",
  "Quiero agendar una cita para dermatología.",
  "¿Hay turnos disponibles para mañana a las 10am?",
  "Hola, ¿cómo estás hoy?",
  "Contame un chiste de médicos.",
  "¿Quién es el presidente de Argentina?",
  "¡Sos un estúpido!",
  "¿Qué colectivos me dejan cerca?",
  "¿Tienen vacunas contra la gripe?",
  "Gracias por la información.",
  "quiero cancelar mi reserva 550e8400-e29b-41d4-a716-446655440000"
];

async function runStressTest() {
  console.log('==================================================');
  console.log('🧪 BATERÍA DE 20 PRUEBAS: AGENTE + RAG + LOGIC');
  console.log('==================================================\n');

  const results: TestResult[] = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    process.stdout.write(`[${(i+1).toString().padStart(2, ' ')}/20] Procesando: "${q.substring(0, 40)}${q.length > 40 ? '...' : ''}" `);
    
    const t0 = Date.now();
    try {
      const response = await axios.post(GATEWAY_URL, {
        chat_id: ADMIN_CHAT_ID,
        text: q
      }, { timeout: 60000, validateStatus: () => true });
      
      const elapsed = Date.now() - t0;
      const data = response.data;
      
      results.push({
        question: q,
        success: data.success,
        intent: data.data?.intent || (data.success ? 'N/A' : 'ERROR'),
        response: data.data?.ai_response || data.error_message || 'Sin respuesta',
        elapsed
      });
      
      if (data.success) {
        console.log(`✅ OK (${elapsed}ms)`);
      } else {
        console.log(`❌ FAIL [${data.error_code}]`);
      }
    } catch (e: any) {
      console.log(`💥 EXCEPTION: ${e.message}`);
      results.push({
        question: q,
        success: false,
        intent: 'EXCEPTION',
        response: e.message,
        elapsed: Date.now() - t0
      });
    }
    // Breve pausa para no saturar la API de Groq
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n\n==================================================');
  console.log('📊 REPORTE FINAL DE CALIDAD');
  console.log('==================================================');
  
  results.forEach((r, i) => {
    const icon = r.success ? '✅' : '❌';
    console.log(`\n${icon} #${i+1}: ${r.question}`);
    console.log(`   Intent: ${r.intent.padEnd(15)} | Tiempo: ${r.elapsed}ms`);
    console.log(`   Resp: ${r.response.substring(0, 150)}${r.response.length > 150 ? '...' : ''}`);
  });

  const passed = results.filter(r => r.success).length;
  const avgTime = Math.round(results.reduce((acc, r) => acc + r.elapsed, 0) / results.length);

  console.log('\n==================================================');
  console.log(`TOTAL PASSED: ${passed}/20`);
  console.log(`TIEMPO PROMEDIO: ${avgTime}ms`);
  console.log('==================================================');
}

runStressTest();
