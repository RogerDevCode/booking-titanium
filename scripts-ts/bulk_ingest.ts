import axios from 'axios';

const INGEST_URL = 'https://n8n.stax.ink/webhook/rag-ingest-document';

const DOCUMENTS = [
  {
    provider_id: 1,
    title: "Política de Cancelación Booking Titanium",
    content: "Las citas pueden cancelarse sin cargo hasta con 24 horas de antelación. Si se cancela con menos de 24 horas, se aplicará un cargo del 50%. En caso de no presentarse sin previo aviso, el cargo será del 100%.",
    source_type: "policy",
    metadata: { version: "2.0", global: true }
  },
  {
    provider_id: 1,
    title: "Seguros y Prepagas Aceptadas",
    content: "Trabajamos con las principales coberturas: OSDE (todos los planes), Swiss Medical, Galeno, y Medicus. Para otras prepagas, por favor consulte por reintegros.",
    source_type: "insurance",
    metadata: { version: "1.5" }
  },
  {
    provider_id: 1,
    title: "Dr. Roger - Especialista en Cardiología",
    content: "El Dr. Roger cuenta con más de 15 años de experiencia en cardiología intervencionista y prevención cardiovascular. Graduado con honores, se especializa en diagnóstico avanzado y tratamiento de arritmias.",
    source_type: "provider",
    metadata: { doctor_id: 1 }
  },
  {
    provider_id: 1,
    service_id: 1,
    title: "Preparación para Consulta de Cardiología",
    content: "Para su primera consulta de cardiología, por favor traiga estudios previos (ECG, laboratorios) de los últimos 6 meses. No es necesario ayuno a menos que se le haya indicado un estudio de esfuerzo específico.",
    source_type: "preparation",
    metadata: { service_id: 1 }
  },
  {
    provider_id: 1,
    title: "Métodos de Pago",
    content: "Aceptamos pagos en efectivo (con 10% de descuento), tarjetas de crédito/débito Visa y Mastercard, y transferencias bancarias vía alias o CBU.",
    source_type: "pricing",
    metadata: { discount: "10% cash" }
  }
];

async function runBulkIngest() {
  console.log('==================================================');
  console.log('🚀 INGESTA MASIVA RAG - DATASET MÍNIMO VIABLE');
  console.log('==================================================\n');

  for (let i = 0; i < DOCUMENTS.length; i++) {
    const doc = DOCUMENTS[i];
    process.stdout.write(`[${i+1}/${DOCUMENTS.length}] Ingestando: "${doc.title}"... `);
    
    try {
      const response = await axios.post(INGEST_URL, doc, { timeout: 30000 });
      if (response.data.success) {
        console.log(`✅ OK (ID: ${response.data.data.document_id})`);
      } else {
        console.log(`❌ FAIL: ${response.data.error_message}`);
      }
    } catch (e: any) {
      console.log(`💥 ERROR: ${e.message}`);
    }
    // Breve pausa para no saturar OpenAI embeddings API
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n==================================================');
  console.log('✨ PROCESO COMPLETADO');
  console.log('==================================================');
}

runBulkIngest();
