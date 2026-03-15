#!/usr/bin/env tsx
/**
 * Test RAG_01 - Spanish & English Character Support
 * ==================================================
 * Tests that RAG_01_Document_Ingestion accepts:
 * - Spanish characters: áéíóúüñÁÉÍÓÚÜÑ
 * - English characters: a-z A-Z
 * - Common punctuation
 * 
 * Usage: npx tsx scripts-ts/test_rag_spanish_english.ts
 */

import { N8NConfig } from './config';

// Initialize config
const config = new N8NConfig();

const N8N_HOST = config.api_url;
const WEBHOOK_URL = `${N8N_HOST}/webhook/rag-ingest-document`;

// Test documents with Spanish and English characters
const testDocuments = [
  {
    name: "Spanish Document - Medical Services",
    data: {
      provider_id: 1,
      title: "Servicios Médicos Disponibles",
      content: "La clínica ofrece las siguientes especialidades: Medicina General, Pediatría, Ginecología y Obstetricia, Traumatología, Cardiología, Dermatología. Cada especialidad cuenta con médicos certificados y tecnología de vanguardia para diagnóstico y tratamiento.",
      source_type: "service",
      language: "es",
      status: "published"
    }
  },
  {
    name: "English Document - Medical Services",
    data: {
      provider_id: 1,
      title: "Medical Services Available",
      content: "The clinic offers the following specialties: General Medicine, Pediatrics, Gynecology and Obstetrics, Traumatology, Cardiology, Dermatology. Each specialty has certified physicians and state-of-the-art technology for diagnosis and treatment.",
      source_type: "service",
      language: "en",
      status: "published"
    }
  },
  {
    name: "Spanish Document - Schedule",
    data: {
      provider_id: 1,
      title: "Horarios de Atención Presencial",
      content: "Horarios de atención: Lunes a Viernes de 8:00 a 20:00 horas. Sábados de 9:00 a 14:00 horas. Domingos y festivos no hay atención presencial, solo urgencias telefónicas. La última hora de atención se reserva 30 minutos antes del cierre.",
      source_type: "schedule",
      language: "es",
      status: "published"
    }
  },
  {
    name: "English Document - Preparation",
    data: {
      provider_id: 1,
      title: "Patient Preparation Guide",
      content: "Before your appointment, please arrive 15 minutes early. Bring your insurance card, identification, and any relevant medical records. If you're taking medications, bring a list or the bottles themselves. Wear comfortable clothing for your examination.",
      source_type: "preparation",
      language: "en",
      status: "published"
    }
  },
  {
    name: "Mixed Spanish-English Document",
    data: {
      provider_id: 1,
      title: "Emergency Contact / Contacto de Emergencia",
      content: "For emergencies, call +56 2 2345 6700 (24/7). Para emergencias, llame al +56 2 2345 6700 (24/7). Emergency services include: trauma, cardiac care, pediatric emergencies. Los servicios de emergencia incluyen: traumatología, atención cardíaca, emergencias pediátricas.",
      source_type: "emergency",
      language: "es",
      status: "published"
    }
  },
  {
    name: "Spanish with Special Characters",
    data: {
      provider_id: 1,
      title: "¿Cómo agendar una hora médica? - Guía completa",
      content: "Para agendar una hora médica, siga estos pasos: 1) Llame al +56 2 2345 6789, 2) Visite nuestra página web, 3) Use nuestra app móvil. ¡Es muy fácil! También puede enviar un correo a contacto@clinica.cl o visitar nuestras oficinas en Av. Principal 1234.",
      source_type: "faq",
      language: "es",
      status: "published"
    }
  }
];

async function testDocument(testCase: typeof testDocuments[0]): Promise<boolean> {
  console.log(`\n📄 Testing: ${testCase.name}`);
  console.log(`   Language: ${testCase.data.language}`);
  console.log(`   Title: ${testCase.data.title.substring(0, 50)}...`);
  
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCase.data)
    });

    console.log(`   Status: ${res.status} ${res.statusText}`);
    
    const text = await res.text();
    
    if (res.status === 200) {
      console.log(`   ✅ SUCCESS - Document accepted`);
      try {
        const json = JSON.parse(text);
        if (json.success) {
          console.log(`   ✓ Validation passed`);
          return true;
        } else {
          console.log(`   ⚠ Validation warning: ${json.error_message || 'Unknown'}`);
          return false;
        }
      } catch {
        console.log(`   ✓ Response received (non-JSON)`);
        return true;
      }
    } else {
      console.log(`   ❌ FAILED - ${text.substring(0, 200)}`);
      return false;
    }
  } catch (e: any) {
    console.log(`   ❌ ERROR - ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RAG_01 Test - Spanish & English Character Support          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 Webhook: ${WEBHOOK_URL}`);
  console.log(`\n📋 Testing ${testDocuments.length} documents with Spanish and English characters...\n`);
  console.log('═'.repeat(64));

  let passed = 0;
  let failed = 0;

  for (const testCase of testDocuments) {
    const result = await testDocument(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '═'.repeat(64));
  console.log('\n📊 RESULTS:');
  console.log(`   ✅ Passed: ${passed}/${testDocuments.length}`);
  console.log(`   ❌ Failed: ${failed}/${testDocuments.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Spanish and English characters are supported.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the validation regex patterns.');
  }
  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
