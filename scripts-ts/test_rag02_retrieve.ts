import fs from 'fs';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/rag-search';

// Watchdog embebido
const WATCHDOG_TIMEOUT = 30000;
const watchdog = setTimeout(() => {
  console.error(`\n🚨 [Watchdog] El script excedió el tiempo límite de ${WATCHDOG_TIMEOUT}ms. Terminando proceso.`);
  process.exit(1);
}, WATCHDOG_TIMEOUT);

async function testRetrieval() {
  console.log('Testing RAG_02 Document Retrieval...');
  
  const payload = {
    query: "atención regular",
    provider_id: 1,
    limit: 5,
    similarity_threshold: 0.0
  };

  console.log(`Sending query: "${payload.query}"`);
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const text = await response.text();
    let result;
    try {
        result = JSON.parse(text);
    } catch(e) {
        console.log(`❌ Response is not JSON: ${text}`);
        clearTimeout(watchdog);
        return;
    }
    
    if (response.ok && result.success) {
      console.log(`✅ Success! Retrieved ${result.data?.document_count || 0} documents.`);
      if (result.data?.documents?.length > 0) {
          result.data.documents.forEach((doc: any, i: number) => {
             console.log(`\n--- Doc ${i+1} [Score: ${doc.similarity?.toFixed(4) || 'N/A'}] ---`);
             console.log(`Title: ${doc.title}`);
             console.log(`Content: ${doc.content}`);
          });
      }
    } else {
      console.log(`❌ Error:`, result.error_message || result);
    }
  } catch (error: any) {
    console.log(`❌ Network Exception:`, error.message);
  } finally {
    clearTimeout(watchdog);
  }
}

testRetrieval();
