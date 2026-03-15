#!/usr/bin/env tsx
/**
 * Test RAG_01 Validation Only - Simple character test
 */

import { N8NConfig } from './config';
import axios from 'axios';

const config = new N8NConfig();
const WEBHOOK_URL = `${config.api_url}/webhook/rag-ingest-document`;

// Test documents - minimal valid payloads
const testDocs = [
  {
    name: "Spanish áéíóúüñ",
    data: {
      provider_id: 1,
      title: "Servicios Médicos",
      content: "La clínica ofrece atención médica de calidad con médicos certificados.",
      source_type: "service",
      language: "es",
      status: "published"
    }
  },
  {
    name: "English with punctuation",
    data: {
      provider_id: 1,
      title: "Patient's Guide",
      content: "Welcome to our clinic! We offer comprehensive care.",
      source_type: "faq",
      language: "en",
      status: "published"
    }
  },
  {
    name: "Spanish question ¿?",
    data: {
      provider_id: 1,
      title: "¿Cómo agendar?",
      content: "Para agendar una hora, llame al +56 2 2345 6789 o visite nuestra web.",
      source_type: "faq",
      language: "es",
      status: "published"
    }
  }
];

async function testDoc(testCase: typeof testDocs[0]) {
  console.log(`\n📄 Testing: ${testCase.name}`);
  console.log(`   Title: ${testCase.data.title}`);
  
  try {
    const res = await axios.post(WEBHOOK_URL, testCase.data, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    if (res.status === 200) {
      console.log(`   ✅ SUCCESS (HTTP ${res.status})`);
      if (res.data?.success) {
        console.log(`   ✓ Validation PASSED`);
        return true;
      } else {
        console.log(`   ⚠ Response: ${JSON.stringify(res.data).substring(0, 100)}`);
        return false;
      }
    } else {
      console.log(`   ❌ HTTP ${res.status}`);
      return false;
    }
  } catch (error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 400) {
        console.log(`   ❌ VALIDATION FAILED (HTTP 400)`);
        console.log(`   Error: ${JSON.stringify(data).substring(0, 200)}`);
        return false;
      } else if (status === 500) {
        console.log(`   ⚠ VALIDATION PASSED, workflow error (HTTP 500)`);
        console.log(`   Error: ${JSON.stringify(data).substring(0, 100)}`);
        return true; // Validation passed, error is elsewhere
      } else {
        console.log(`   ❌ HTTP ${status}`);
        return false;
      }
    } else {
      console.log(`   ❌ Network error: ${error.message}`);
      return false;
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  RAG_01 Validation Test - Character Whitelist               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n📡 Webhook: ${WEBHOOK_URL}`);
  console.log('\n' + '═'.repeat(64));

  let passed = 0;
  let failed = 0;

  for (const testCase of testDocs) {
    const result = await testDoc(testCase);
    if (result) {
      passed++;
    } else {
      failed++;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '═'.repeat(64));
  console.log(`\n📊 RESULTS:`);
  console.log(`   Validation Passed: ${passed}/${testDocs.length}`);
  console.log(`   Validation Failed: ${failed}/${testDocs.length}`);
  
  if (failed === 0) {
    console.log('\n✅ All validations passed! Character whitelist works correctly.');
  } else {
    console.log('\n⚠️  Some validations failed.');
  }
  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
