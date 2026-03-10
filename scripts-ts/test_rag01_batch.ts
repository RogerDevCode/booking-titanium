import fs from 'fs';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/rag-ingest-document';

// Watchdog embebido
const WATCHDOG_TIMEOUT = 60000;
const watchdog = setTimeout(() => {
  console.error(`\n🚨 [Watchdog] El script excedió el tiempo límite de ${WATCHDOG_TIMEOUT}ms. Terminando proceso.`);
  process.exit(1);
}, WATCHDOG_TIMEOUT);

const documents = [
  // --- FAQs ---
  {
    provider_id: 1,
    title: "FAQ: Ubicación de la clínica",
    content: "Pregunta: ¿Dónde están ubicados y cómo puedo contactarlos?\nRespuesta: La clínica Booking Titanium se encuentra ubicada en Av. Corrientes 1234, Ciudad Autónoma de Buenos Aires (CABA). Puedes comunicarte con nosotros al teléfono 011-4567-8910 o por WhatsApp para cualquier consulta o emergencia.",
    source_type: "faq",
    status: "published",
    language: "es"
  },
  {
    provider_id: 1,
    title: "FAQ: Preparación para primera visita",
    content: "Pregunta: ¿Qué debo llevar a mi primera consulta médica?\nRespuesta: Para tu primera visita a la clínica Booking Titanium, es indispensable que traigas tu DNI físico, la credencial física o digital de tu obra social o medicina prepaga, y cualquier estudio médico previo relacionado con tu consulta. Te recomendamos llegar 10 minutos antes de la hora de tu turno.",
    source_type: "preparation",
    status: "published",
    language: "es"
  },
  // --- PRECIOS ---
  {
    provider_id: 1,
    title: "Precios: Consulta inicial particular",
    content: "Pregunta: ¿Cuál es el precio de una consulta particular si no tengo obra social?\nRespuesta: El valor de la consulta médica inicial de forma particular (sin cobertura médica) en Booking Titanium es de $15,000 ARS. Este valor incluye la evaluación diagnóstica, pero no incluye estudios complementarios ni procedimientos adicionales.",
    source_type: "pricing",
    status: "published",
    language: "es"
  },
  {
    provider_id: 1,
    title: "Precios: Medios de pago aceptados",
    content: "Pregunta: ¿Cuáles son los métodos de pago aceptados en la clínica?\nRespuesta: En la clínica Booking Titanium aceptamos pagos en efectivo, transferencias bancarias (alias: booking.titanium), tarjetas de débito y tarjetas de crédito (Visa, MasterCard y American Express). Ofrecemos hasta 3 cuotas sin interés con tarjetas bancarizadas para tratamientos prolongados.",
    source_type: "pricing",
    status: "published",
    language: "es"
  },
  // --- HORARIOS ---
  {
    provider_id: 1,
    title: "Horarios: Atención regular",
    content: "Pregunta: ¿En qué horarios atienden y abren la clínica?\nRespuesta: El horario de atención regular de Booking Titanium es de Lunes a Viernes desde las 08:00 AM hasta las 20:00 PM de forma corrida. Durante este horario operan todas las especialidades y el sector de administración.",
    source_type: "schedule",
    status: "published",
    language: "es"
  },
  {
    provider_id: 1,
    title: "Horarios: Fines de semana y feriados",
    content: "Pregunta: ¿La clínica abre los sábados, domingos o días feriados?\nRespuesta: Los días Sábados abrimos únicamente para consultas programadas de 09:00 AM a 13:00 PM. Los días Domingos y Feriados Nacionales la clínica Booking Titanium permanece cerrada. Para urgencias en esos días, por favor dirígete a la guardia del hospital más cercano.",
    source_type: "schedule",
    status: "published",
    language: "es"
  },
  // --- SEGUROS Y OBRAS SOCIALES ---
  {
    provider_id: 1,
    title: "Seguros: Obras sociales y prepagas aceptadas",
    content: "Pregunta: ¿Qué obras sociales y prepagas médicas aceptan?\nRespuesta: En Booking Titanium trabajamos con las principales prepagas del país: OSDE (planes 210 en adelante), Swiss Medical, Galeno, Medicus, y Sancor Salud. También aceptamos PAMI para ciertas especialidades. Por favor, verifica tu plan específico al momento de sacar el turno.",
    source_type: "insurance",
    status: "published",
    language: "es"
  },
  {
    provider_id: 1,
    title: "Seguros: Reintegros y facturación",
    content: "Pregunta: Si mi seguro no está en la lista, ¿puedo pedir factura para reintegro?\nRespuesta: Sí. Si tu obra social o medicina prepaga no tiene convenio directo con Booking Titanium, abonas la consulta de forma particular y te emitimos una Factura C oficial y electrónica. Con esa factura y la orden del profesional, puedes solicitar el reintegro a tu aseguradora según tu plan.",
    source_type: "insurance",
    status: "published",
    language: "es"
  },
  // --- SERVICIOS ---
  {
    provider_id: 1,
    title: "Servicios: Odontología General",
    content: "Pregunta: ¿Qué incluye el servicio de Odontología General y Limpieza?\nRespuesta: Nuestro servicio de Odontología General abarca diagnóstico, prevención y tratamiento de problemas dentales comunes. Incluye limpieza dental profunda (profilaxis con ultrasonido), tratamiento de caries (arreglos), extracciones simples y fluoración. Recomendamos una visita de control cada 6 meses.",
    source_type: "service",
    status: "published",
    language: "es"
  },
  {
    provider_id: 1,
    title: "Servicios: Ortodoncia",
    content: "Pregunta: ¿Hacen tratamientos de ortodoncia o brackets?\nRespuesta: Sí, en la especialidad de Ortodoncia en Booking Titanium ofrecemos tratamientos con brackets metálicos tradicionales, brackets estéticos (zafiro o porcelana) y alineadores invisibles (ortodoncia invisible). El tiempo y costo del tratamiento se define tras la evaluación inicial con la ortodoncista.",
    source_type: "service",
    status: "published",
    language: "es"
  }
];

async function runBatchIngestion() {
  console.log(`Iniciando ingesta de ${documents.length} documentos para RAG...\\n`);
  
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`[${i+1}/${documents.length}] Subiendo: "${doc.title}"...`);
    
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log(`  ✅ Éxito | ID: ${result.data?.document_id}`);
        successCount++;
      } else {
        console.log(`  ❌ Error:`, result.error_message || result);
        errorCount++;
      }
    } catch (error: any) {
      console.log(`  ❌ Excepción de red:`, error.message);
      errorCount++;
    }
    
    // Pequeño delay para no saturar OpenAI API
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\\n--- RESUMEN DE INGESTA ---`);
  console.log(`✅ Exitosos: ${successCount}`);
  console.log(`❌ Fallidos: ${errorCount}`);
  
  clearTimeout(watchdog);
}

runBatchIngestion();
