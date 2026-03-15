// scripts-ts/test_rag_webhook.ts
// Test básico del webhook RAG_01 para diagnosticar errores

import { N8NConfig } from './config';

// Initialize config (loads .env automatically from project root)
const config = new N8NConfig();

const N8N_HOST = config.api_url;
const WEBHOOK_URL = `${N8N_HOST}/webhook/rag-ingest-document`;

const testDoc = {
  provider_id: 1,
  title: "Test",
  content: "Este es un documento de prueba para verificar el webhook.",
  source_type: "other",  // ✅ Valor válido del ENUM rag_source_type
  language: "es",
  status: "published"
};

async function test() {
  console.log(`Testing: ${WEBHOOK_URL}`);
  console.log(`Payload: ${JSON.stringify(testDoc, null, 2)}\n`);
  
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDoc)
    });
    
    console.log(`Status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(`Response: ${text}\n`);
    
    try {
      const json = JSON.parse(text);
      console.log('Parsed JSON:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Response is not valid JSON');
    }
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`Error: ${errorMessage}`);
  }
}

test();
