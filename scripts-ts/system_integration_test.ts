import axios from 'axios';

const GATEWAY_URL = 'https://n8n.stax.ink/webhook/nn-01-booking-gateway';
const ADMIN_CHAT_ID = 5391760292;

interface TestResult {
  name: string;
  success: boolean;
  details: string;
  response?: any;
}

async function runTest(name: string, payload: any): Promise<TestResult> {
  console.log(`\n▶️  Ejecutando: ${name}`);
  console.log(`   Payload: ${JSON.stringify(payload)}`);
  
  try {
    const t0 = Date.now();
    const response = await axios.post(GATEWAY_URL, payload, {
      timeout: 60000,
      validateStatus: () => true
    });
    const elapsed = Date.now() - t0;
    
    const data = response.data;
    const isStandardContract = data && typeof data.success === 'boolean' && data._meta;
    
    if (response.status !== 200) {
      return {
        name,
        success: false,
        details: `HTTP ${response.status} - ${JSON.stringify(data).substring(0, 100)}`,
        response: data
      };
    }

    if (!isStandardContract) {
      return {
        name,
        success: false,
        details: `Respuesta no cumple Standard Contract (O02)`,
        response: data
      };
    }

    if (data.success) {
      return {
        name,
        success: true,
        details: `OK (${elapsed}ms) - Intent: ${data.data?.intent || 'N/A'}`,
        response: data
      };
    } else {
      return {
        name,
        success: false,
        details: `Fallo lógico: ${data.error_code} - ${data.error_message}`,
        response: data
      };
    }
  } catch (error: any) {
    return {
      name,
      success: false,
      details: `Excepción: ${error.message}`
    };
  }
}

async function main() {
  console.log('==================================================');
  console.log('🚀 SYSTEM INTEGRATION TEST - BOOKING TITANIUM');
  console.log('==================================================');
  
  const tests = [
    {
      name: "ESC-01: Consulta FAQ (RAG - Cardiología)",
      payload: { chat_id: ADMIN_CHAT_ID, text: "Hola, ¿qué servicios de cardiología tienen?" },
      expectedSuccess: true
    },
    {
      name: "ESC-02: Disponibilidad (check_availability)",
      payload: { chat_id: ADMIN_CHAT_ID, text: "¿Hay turnos para mañana?" },
      expectedSuccess: true
    },
    {
      name: "ESC-03: Error de Validación (Payload vacío)",
      payload: { chat_id: ADMIN_CHAT_ID },
      expectedSuccess: false,
      expectedErrorCode: 'VALIDATION_ERROR'
    },
    {
      name: "ESC-04: Seguridad (Firewall - Profanidad)",
      payload: { chat_id: ADMIN_CHAT_ID, text: "eres un idiota" },
      expectedSuccess: false,
      expectedErrorCode: 'SECURITY_BLOCKED'
    },
    {
      "name": "ESC-05: Cancelación (Formato Válido)",
      payload: { chat_id: ADMIN_CHAT_ID, text: "quiero cancelar mi reserva 550e8400-e29b-41d4-a716-446655440000" },
      expectedSuccess: true
    },
    {
      "name": "ESC-06: Re-agenda (Formato Válido)",
      payload: { chat_id: ADMIN_CHAT_ID, text: "quiero cambiar mi turno 550e8400-e29b-41d4-a716-446655440000 para mañana a las 15:00" },
      expectedSuccess: true
    },
    {
      "name": "ESC-07: Cancelación (Short ID)",
      payload: { chat_id: ADMIN_CHAT_ID, text: "cancela mi turno BKG-ABC123" },
      expectedSuccess: true
    },
    {
      "name": "ESC-08: Consulta Mis Turnos",
      payload: { chat_id: ADMIN_CHAT_ID, text: "¿Cuáles son mis turnos?" },
      expectedSuccess: true
    }
    ];  const results: TestResult[] = [];
  
  for (const t of tests) {
    const res = await runTest(t.name, t.payload);
    
    if (t.expectedSuccess === false) {
        const matchesError = res.response?.error_code === t.expectedErrorCode;
        res.success = matchesError;
        res.details = matchesError 
            ? `OK (Error esperado capturado: ${t.expectedErrorCode})`
            : `FAIL (Esperaba ${t.expectedErrorCode} pero obtuvo ${res.response?.error_code})`;
    }

    results.push(res);
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n\n==================================================');
  console.log('📊 RESUMEN DE RESULTADOS');
  console.log('==================================================');
  
  let passed = 0;
  results.forEach((r, i) => {
    const icon = r.success ? '✅' : '❌';
    console.log(`${icon} [${i+1}/${results.length}] ${r.name.padEnd(45)} | ${r.details}`);
    if (r.success) passed++;
  });

  console.log('==================================================');
  console.log(`TOTAL: ${passed}/${results.length} PASSED`);
  
  if (passed === results.length) {
    console.log('🎊 SISTEMA INTEGRADO Y OPERATIVO');
    process.exit(0);
  } else {
    console.log('⚠️ SE DETECTARON FALLOS EN LA INTEGRACIÓN');
    process.exit(1);
  }
}

main();
