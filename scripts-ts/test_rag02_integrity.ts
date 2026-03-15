import fs from 'fs';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/rag-search';

async function testRetrievalIntegrity() {
  console.log('--- TEST DE RECUPERACIÓN DE INTEGRIDAD (RAG_02) ---');
  
  const payload = {
    query: "documento secreto para validar la integridad de la base de datos RAG áéíóú",
    provider_id: 1,
    limit: 1,
    similarity_threshold: 0.1
  };

  console.log(`Buscando: "${payload.query}"`);
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json() as any;
    
    if (response.ok && result.success) {
      const docs = result.data?.documents || [];
      if (docs.length > 0) {
        const doc = docs[0];
        console.log(`\n✅ Documento recuperado con éxito.`);
        console.log(`ID: ${doc.id}`);
        console.log(`Título: ${doc.title}`);
        console.log(`Similitud: ${doc.similarity}`);
        console.log(`Contenido recuperado: "${doc.content}"`);
        
        // Verificación de integridad de caracteres
        if (doc.content.includes("áéíóú") && doc.content.includes("$%")) {
          console.log("\n✨ VALIDACIÓN EXITOSA: Los caracteres especiales y símbolos se recuperaron correctamente.");
        } else {
          console.warn("\n⚠️ ADVERTENCIA: Algunos caracteres especiales podrían haberse corrompido en la recuperación.");
        }
      } else {
        console.log(`❌ No se encontraron documentos. Revisa el threshold.`);
      }
    } else {
      console.log(`❌ Error en RAG_02:`, result.error_message || result);
    }
  } catch (error: any) {
    console.log(`❌ Excepción:`, error.message);
  }
}

testRetrievalIntegrity();
