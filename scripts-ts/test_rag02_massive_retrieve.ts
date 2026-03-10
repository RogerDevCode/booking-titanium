import fs from 'fs';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/rag-search';

// Watchdog
const WATCHDOG_TIMEOUT = 30000;
const watchdog = setTimeout(() => {
  console.error(`\n🚨 [Watchdog] El script excedió el tiempo límite de ${WATCHDOG_TIMEOUT}ms. Terminando proceso.`);
  process.exit(1);
}, WATCHDOG_TIMEOUT);

async function retrieveAll() {
  console.log('Recuperando los 20 documentos inyectados...');
  
  const payload = {
    query: "Cardiología",
    provider_id: 1,
    limit: 20,
    similarity_threshold: 0.0 // Traer todo lo que coincida aunque sea poco
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json() as any;
    
    if (response.ok && result.success) {
      const docs = result.data?.documents || [];
      console.log(`✅ Se recuperaron ${docs.length} documentos.`);
      
      docs.forEach((doc: any, i: number) => {
        console.log(`${(i+1).toString().padStart(2, ' ')}. [Score: ${doc.similarity.toFixed(4)}] ${doc.title}`);
      });
      
      if (docs.length === 20) {
        console.log("\n✨ TEST EXITOSO: Se recuperaron exactamente los 20 documentos inyectados.");
      } else {
        console.log(`\n⚠️ Se recuperaron ${docs.length} de 20. Es posible que el motor vectorial haya agrupado resultados muy similares.`);
      }
    } else {
      console.error("❌ Error en RAG_02:", result.error_message);
    }
  } catch (e: any) {
    console.error("❌ Excepción:", e.message);
  } finally {
    clearTimeout(watchdog);
  }
}

retrieveAll();
