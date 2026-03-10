// scripts-ts/seed_rag_documents.ts
// Seed script para cargar documentos RAG en la base de datos
// Ejecutar: npx tsx scripts-ts/seed_rag_documents.ts

import { N8NConfig } from './config';

// Initialize config (loads .env automatically from project root)
const config = new N8NConfig();

const N8N_HOST = config.api_url;
const WEBHOOK_URL = `${N8N_HOST}/webhook/rag-ingest-document`;

// ============================================================================
// 10 DOCUMENTOS REALES PARA CLÍNICA MÉDICA - CASOS DE PRODUCCIÓN
// ============================================================================

const documents = [
  {
    provider_id: 1,
    service_id: null,
    title: "Servicios médicos disponibles",
    content: "La clínica ofrece las siguientes especialidades: Medicina General, Pediatría, Ginecología y Obstetricia, Traumatología, Cardiología, Dermatología, Nutrición, Psicología, Kinesiología, Medicina del Deporte. Cada especialidad cuenta con médicos certificados y tecnología de vanguardia para diagnóstico y tratamiento.",
    source_type: "service",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "servicios", tags: ["especialidades", "médicos"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Horarios de atención presencial",
    content: "Horarios de atención: Lunes a Viernes de 8:00 a 20:00 horas. Sábados de 9:00 a 14:00 horas. Domingos y festivos no hay atención presencial, solo urgencias telefónicas. La última hora de atención se reserva 30 minutos antes del cierre.",
    source_type: "schedule",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "horarios", tags: ["atención", "horario"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Ubicación y contacto",
    content: "Dirección: Av. Principal 1234, piso 3, Santiago Centro. Teléfono: +56 2 2345 6789. WhatsApp: +56 9 8765 4321. Email: contacto@clinica.cl. Emergencias 24/7: +56 2 2345 6700. Contamos con estacionamiento para pacientes en el mismo edificio.",
    source_type: "other",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "contacto", tags: ["ubicación", "teléfono", "emergencia"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Precios y aranceles de consultas",
    content: "Aranceles 2026: Consulta Medicina General $25.000. Especialidades $35.000 - $45.000. Kinesiología $30.000 por sesión. Nutrición $28.000. Psicología $32.000. Aceptamos Fonasa (tramo B, C, D) y todas las Isapres (Banmédica, Colmena, Cruz Blanca, Nueva Masvida, Vida Tres). Reembolso según plan.",
    source_type: "pricing",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "precios", tags: ["aranceles", "fonasa", "isapre"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Reserva y cancelación de horas",
    content: "Para agendar hora: llama al +56 2 2345 6789, escribe al WhatsApp +56 9 8765 4321, o reserva online en nuestra web. Cancelaciones con 24 horas de anticipación sin cargo. Cancelaciones con menos de 24 horas tienen un costo del 50% del valor de la consulta. Inasistencias sin aviso se cobran completas.",
    source_type: "policy",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "reservas", tags: ["cancelación", "políticas", "agenda"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Preparación para exámenes de laboratorio",
    content: "Exámenes de sangre: Ayuno de 12 horas (solo agua permitida). No consumir alcohol 24 horas antes. Evitar ejercicio intenso el día anterior. Examen de orina: recolectar primera orina de la mañana en envase estéril. Ecografía abdominal: venir con vejiga llena, tomar 1 litro de agua 1 hora antes.",
    source_type: "preparation",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "exámenes", tags: ["laboratorio", "preparación", "ayuno"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Certificados médicos y licencias",
    content: "Emitimos certificados médicos por consulta presencial o telemedicina. Licencias médicas se tramitan con diagnóstico y evaluación del médico tratante. Certificados para deporte, trabajo o estudios se entregan el mismo día. Valor certificado: $5.000. Licencia médica sigue valor de la consulta.",
    source_type: "other",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "certificados", tags: ["licencias", "documentos"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Telemedicina y consulta online",
    content: "Atención por videollamada disponible para Medicina General, Psicología y Nutrición. Mismo valor que consulta presencial. Se envía enlace de Zoom 15 minutos antes de la hora. Necesitas cámara, micrófono y conexión estable. Receta médica se envía por email dentro de 24 horas.",
    source_type: "service",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "telemedicina", tags: ["online", "videollamada", "zoom"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Programa de medicina preventiva",
    content: "Check-up anual incluye: examen físico completo, hemograma, perfil lipídico, glicemia, creatinina, TSH, examen de orina, electrocardiograma. Valor paquete: $89.900 (ahorra 30%). Adultos mayores de 40 años: chequeo semestral recomendado. Incluye evaluación de factores de riesgo cardiovascular.",
    source_type: "service",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "preventivo", tags: ["check-up", "examen", "prevención"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Vacunación y calendario vacunas",
    content: "Administramos todas las vacunas del calendario PNI y vacunas de viajero. Influenza (octubre-noviembre), COVID-19 refuerzo, Hepatitis A y B, VPH (niños 9-14 años), Antineumocócica (adultos mayores 65), Tétanos (cada 10 años). Vacunas de viajero: consultar según destino. Emitimos certificado internacional.",
    source_type: "service",  // ✅ Valor válido del ENUM
    language: "es",
    status: "published",
    metadata: { category: "vacunas", tags: ["inmunización", "viajero", "PNI"] }
  }
];

// ============================================================================
// FUNCIONES DE INGESTIÓN
// ============================================================================

async function ingestDocument(doc: typeof documents[0], index: number, total: number) {
  const startTime = Date.now();
  
  try {
    console.log(`📤 [${String(index + 1).padStart(2)}/${total}] Enviando: "${doc.title}"`);
    console.log(`   Payload: source_type="${doc.source_type}", content_length=${doc.content.length}`);
    
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'RAG-Seed-Script/1.0'
      },
      body: JSON.stringify(doc)
    });
    
    const elapsed = Date.now() - startTime;
    const text = await res.text();
    console.log(`   Status: ${res.status} ${res.statusText} (${elapsed}ms)`);
    console.log(`   Response: ${text.substring(0, 300)}`);
    
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error(`   Parse error: ${e}`);
      return false;
    }
    
    if (json.success) {
      console.log(`✅ [${String(index + 1).padStart(2)}/${total}] "${doc.title}" → id: ${json.data?.document_id}`);
      return true;
    } else {
      console.error(`❌ [${String(index + 1).padStart(2)}/${total}] "${doc.title}" → ${json.error_message}`);
      return false;
    }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`💥 [${String(index + 1).padStart(2)}/${total}] "${doc.title}" → ${errorMessage}`);
    return false;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  RAG Document Ingestion - Clínica Médica                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 Webhook: ${WEBHOOK_URL}`);
  console.log(`📄 Documentos a ingerir: ${documents.length}`);
  console.log(`⏱️  Delay entre requests: 3000ms (3 segundos)`);
  console.log('\n' + '─'.repeat(64) + '\n');

  const startTime = Date.now();
  const results = { success: 0, failed: 0 };

  for (let i = 0; i < documents.length; i++) {
    const success = await ingestDocument(documents[i], i, documents.length);
    results.success += success ? 1 : 0;
    results.failed += success ? 0 : 1;
    
    // Delay entre requests para no saturar OpenAI API (3 segundos)
    if (i < documents.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '─'.repeat(64));
  console.log('📊 RESUMEN DE INGESTIÓN');
  console.log('─'.repeat(64));
  console.log(`✅ Exitosos:  ${results.success}/${documents.length}`);
  console.log(`❌ Fallidos:   ${results.failed}/${documents.length}`);
  console.log(`⏱️  Tiempo total: ${totalTime}s`);
  console.log(`📈 Tasa de éxito: ${((results.success / documents.length) * 100).toFixed(1)}%`);
  console.log('─'.repeat(64) + '\n');

  if (results.failed === 0) {
    console.log('🎉 ¡Ingestión completada exitosamente!\n');
    console.log('📝 Próximos pasos:');
    console.log('   1. Verificar documentos en tabla rag_documents');
    console.log('   2. Testear RAG_02_Document_Retrieval con queries');
    console.log('   3. Integrar con NN_03-B branch get_services\n');
  } else {
    console.log('⚠️  Ingestión completada con errores. Revisa los fallos arriba.\n');
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);
