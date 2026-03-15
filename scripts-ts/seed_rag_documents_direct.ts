// scripts-ts/seed_rag_documents_direct.ts
// Seed script de carga DIRECTA a PostgreSQL (sin pasar por webhook RAG_01)
// Útil cuando el workflow RAG_01 tiene problemas de credenciales
// Ejecutar: npx tsx scripts-ts/seed_rag_documents_direct.ts

import { N8NConfig } from './config';
import { Client } from 'pg';

// Initialize config (loads .env automatically from project root)
const config = new N8NConfig();

// Neon PostgreSQL - base de datos en la nube
const DATABASE_URL = process.env.DATABASE_URL || process.env.REMOTE_NEON_DB_URL || '';

// ============================================================================
// 10 DOCUMENTOS REALES PARA CLÍNICA MÉDICA
// ============================================================================

const documents = [
  {
    provider_id: 1,
    service_id: null,
    title: "Servicios médicos disponibles",
    content: "La clínica ofrece las siguientes especialidades: Medicina General, Pediatría, Ginecología y Obstetricia, Traumatología, Cardiología, Dermatología, Nutrición, Psicología, Kinesiología, Medicina del Deporte. Cada especialidad cuenta con médicos certificados y tecnología de vanguardia.",
    source_type: "service",
    language: "es",
    status: "published",
    metadata: { category: "servicios", tags: ["especialidades", "médicos"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Horarios de atención presencial",
    content: "Horarios de atención: Lunes a Viernes de 8:00 a 20:00 horas. Sábados de 9:00 a 14:00 horas. Domingos y festivos no hay atención presencial, solo urgencias telefónicas. La última hora de atención se reserva 30 minutos antes del cierre.",
    source_type: "schedule",
    language: "es",
    status: "published",
    metadata: { category: "horarios", tags: ["atención", "horario"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Ubicación y contacto",
    content: "Dirección: Av. Principal 1234, piso 3, Santiago Centro. Teléfono: +56 2 2345 6789. WhatsApp: +56 9 8765 4321. Email: contacto@clinica.cl. Emergencias 24/7: +56 2 2345 6700. Contamos con estacionamiento para pacientes en el mismo edificio.",
    source_type: "other",
    language: "es",
    status: "published",
    metadata: { category: "contacto", tags: ["ubicación", "teléfono", "emergencia"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Precios y aranceles de consultas",
    content: "Aranceles 2026: Consulta Medicina General $25.000. Especialidades $35.000 - $45.000. Kinesiología $30.000 por sesión. Nutrición $28.000. Psicología $32.000. Aceptamos Fonasa (tramo B, C, D) y todas las Isapres (Banmédica, Colmena, Cruz Blanca, Nueva Masvida, Vida Tres). Reembolso según plan.",
    source_type: "pricing",
    language: "es",
    status: "published",
    metadata: { category: "precios", tags: ["aranceles", "fonasa", "isapre"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Reserva y cancelación de horas",
    content: "Para agendar hora: llama al +56 2 2345 6789, escribe al WhatsApp +56 9 8765 4321, o reserva online en nuestra web. Cancelaciones con 24 horas de anticipación sin cargo. Cancelaciones con menos de 24 horas tienen un costo del 50% del valor de la consulta. Inasistencias sin aviso se cobran completas.",
    source_type: "policy",
    language: "es",
    status: "published",
    metadata: { category: "reservas", tags: ["cancelación", "políticas", "agenda"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Preparación para exámenes de laboratorio",
    content: "Exámenes de sangre: Ayuno de 12 horas (solo agua permitida). No consumir alcohol 24 horas antes. Evitar ejercicio intenso el día anterior. Examen de orina: recolectar primera orina de la mañana en envase estéril. Ecografía abdominal: venir con vejiga llena, tomar 1 litro de agua 1 hora antes.",
    source_type: "preparation",
    language: "es",
    status: "published",
    metadata: { category: "exámenes", tags: ["laboratorio", "preparación", "ayuno"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Certificados médicos y licencias",
    content: "Emitimos certificados médicos por consulta presencial o telemedicina. Licencias médicas se tramitan con diagnóstico y evaluación del médico tratante. Certificados para deporte, trabajo o estudios se entregan el mismo día. Valor certificado: $5.000. Licencia médica sigue valor de la consulta.",
    source_type: "other",
    language: "es",
    status: "published",
    metadata: { category: "certificados", tags: ["licencias", "documentos"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Telemedicina y consulta online",
    content: "Atención por videollamada disponible para Medicina General, Psicología y Nutrición. Mismo valor que consulta presencial. Se envía enlace de Zoom 15 minutos antes de la hora. Necesitas cámara, micrófono y conexión estable. Receta médica se envía por email dentro de 24 horas.",
    source_type: "service",
    language: "es",
    status: "published",
    metadata: { category: "telemedicina", tags: ["online", "videollamada", "zoom"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Programa de medicina preventiva",
    content: "Check-up anual incluye: examen físico completo, hemograma, perfil lipídico, glicemia, creatinina, TSH, examen de orina, electrocardiograma. Valor paquete: $89.900 (ahorra 30%). Adultos mayores de 40 años: chequeo semestral recomendado. Incluye evaluación de factores de riesgo cardiovascular.",
    source_type: "service",
    language: "es",
    status: "published",
    metadata: { category: "preventivo", tags: ["check-up", "examen", "prevención"] }
  },
  {
    provider_id: 1,
    service_id: null,
    title: "Vacunación y calendario vacunas",
    content: "Administramos todas las vacunas del calendario PNI y vacunas de viajero. Influenza (octubre-noviembre), COVID-19 refuerzo, Hepatitis A y B, VPH (niños 9-14 años), Antineumocócica (adultos mayores 65), Tétanos (cada 10 años). Vacunas de viajero: consultar según destino. Emitimos certificado internacional.",
    source_type: "service",
    language: "es",
    status: "published",
    metadata: { category: "vacunas", tags: ["inmunización", "viajero", "PNI"] }
  }
];

// ============================================================================
// FUNCIONES DE INSERCIÓN DIRECTA
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  RAG Document Ingestion - Carga Directa PostgreSQL            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 Database: ${DATABASE_URL.substring(0, 30)}...`);
  console.log(`📄 Documentos a insertar: ${documents.length}`);
  console.log('\n' + '─'.repeat(64) + '\n');

  if (!DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL no configurada en .env.local');
    console.error('   Copia .env.example a .env.local y configura la URL de PostgreSQL');
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Conectado a PostgreSQL\n');

    // Verificar si la tabla existe
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'rag_documents'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('❌ ERROR: La tabla rag_documents no existe');
      console.error('   Ejecuta primero el DDL para crear la tabla');
      process.exit(1);
    }
    console.log('✅ Tabla rag_documents verificada\n');

    const results = { success: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const startTime = Date.now();
      
      try {
        // Generar embedding mock (ceros) para testing
        // En producción, esto debería venir de OpenAI API
        const embedding = Array(1536).fill(0);
        const summary = doc.content.length > 200 
          ? doc.content.substring(0, 197) + '...' 
          : doc.content;

        const query = `
          INSERT INTO rag_documents (
            provider_id, service_id, title, content, summary,
            embedding, source_type, status, language, metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          )
          RETURNING id;
        `;

        const values = [
          doc.provider_id,
          doc.service_id,
          doc.title,
          doc.content,
          summary,
          `[${embedding.join(',')}]`,
          doc.source_type,
          doc.status,
          doc.language,
          JSON.stringify(doc.metadata)
        ];

        const result = await client.query(query, values);
        const elapsed = Date.now() - startTime;
        
        console.log(`✅ [${String(i + 1).padStart(2)}/${documents.length}] (${elapsed}ms) "${doc.title}" → id: ${result.rows[0].id}`);
        results.success++;

      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error(`❌ [${String(i + 1).padStart(2)}/${documents.length}] "${doc.title}" → ${errorMessage}`);
        
        if (errorMessage.includes('duplicate key')) {
          results.skipped++;
        } else {
          results.failed++;
        }
      }
    }

    console.log('\n' + '─'.repeat(64));
    console.log('📊 RESUMEN DE INGESTIÓN');
    console.log('─'.repeat(64));
    console.log(`✅ Exitosos:  ${results.success}/${documents.length}`);
    console.log(`⏭️  Saltados:   ${results.skipped}/${documents.length} (duplicados)`);
    console.log(`❌ Fallidos:   ${results.failed}/${documents.length}`);
    console.log('─'.repeat(64) + '\n');

    if (results.failed === 0) {
      console.log('🎉 ¡Ingestión completada exitosamente!\n');
      console.log('📝 Próximos pasos:');
      console.log('   1. Verificar documentos: SELECT id, title FROM rag_documents;');
      console.log('   2. Testear búsqueda: SELECT * FROM hybrid_search_rag_documents(...)');
      console.log('   3. Integrar con NN_03-B branch get_services\n');
    } else {
      console.log('⚠️  Ingestión completada con errores. Revisa los fallos arriba.\n');
      process.exit(1);
    }

  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error('💥 Error fatal:', errorMessage);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
