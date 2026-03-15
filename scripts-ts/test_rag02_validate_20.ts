import fs from 'fs';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/rag-search';

const keywords = [
  "Cardiología", "Pediatría", "Dermatología", "Nutrición", "Psicología",
  "Cancelación", "Urgencia", "Efectivo", "Tarjeta", "Estacionamiento",
  "Colectivos", "OSDE", "Swiss", "Videollamada", "WhatsApp",
  "App", "Laboratorio", "Vacunatorio", "Viajeros", "Soporte"
];

async function validateAll() {
  console.log('--- VALIDACIÓN DE RECUPERACIÓN (20/20) ---');
  
  let totalFound = 0;
  
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: kw,
          provider_id: 1,
          limit: 1,
          similarity_threshold: 0.1
        })
      });
      
      const result = await response.json() as any;
      if (result.success && result.data?.documents?.length > 0) {
        const doc = result.data.documents[0];
        console.log(`[${(i+1).toString().padStart(2, ' ')}/20] ✅ Keyword "${kw.padEnd(15)}" -> Doc: "${doc.title}" (Score: ${doc.similarity.toFixed(4)})`);
        totalFound++;
      } else {
        console.error(`[${(i+1).toString().padStart(2, ' ')}/20] ❌ Keyword "${kw.padEnd(15)}" -> NO ENCONTRADO`);
      }
    } catch (e: any) {
      console.error(`[${(i+1).toString().padStart(2, ' ')}/20] ❌ Excepción:`, e.message);
    }
    // Delay to be nice
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n--- RESULTADO FINAL ---`);
  console.log(`Documentos recuperados: ${totalFound}/20`);
}

validateAll();
