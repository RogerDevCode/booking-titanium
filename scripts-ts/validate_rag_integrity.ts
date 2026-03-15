const INGEST_URL = 'https://n8n.stax.ink/webhook/rag-ingest-document';
const INSPECT_URL = 'https://n8n.stax.ink/webhook/db-inspector-validate';

const testDoc = {
  provider_id: 1,
  title: "Integrity Test Doc",
  content: "Este es un documento secreto para validar la integridad de la base de datos RAG. Contiene caracteres especiales como áéíóú y símbolos $%.",
  source_type: "manual",
  status: "published",
  language: "es"
};

async function validateIntegrity() {
  console.log("--- INICIANDO TEST DE INTEGRIDAD RAG_01 ---");
  
  // 1. Ingestar documento
  console.log("1. Enviando documento al webhook...");
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testDoc)
  });
  
  const result = await response.json() as any;
  if (!result.success) {
    console.error("❌ Error en la ingesta:", result.error_message);
    return;
  }
  
  const docId = result.data.document_id;
  console.log(`✅ Ingesta exitosa. Document ID: ${docId}`);

  // 2. Verificar vía DB_Inspector
  console.log("2. Llamando a DB_Inspector para verificar guardado...");
  const inspectResponse = await fetch(INSPECT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_id: docId })
  });
  
  const dbDoc = await inspectResponse.json() as any;
  
  if (!dbDoc.id) {
    console.error("❌ ERROR: El documento no se encontró en la base de datos.");
    return;
  }
  
  // Comparar contenido
  console.log("\n--- COMPARACIÓN DE DATOS (IN vs DB) ---");
  console.log(`IN Content:  "${testDoc.content}"`);
  console.log(`DB Content:  "${dbDoc.content}"`);
  
  if (testDoc.content === dbDoc.content) {
    console.log("✅ RESULTADO: El contenido coincide exactamente.");
  } else {
    console.error("❌ ERROR: El contenido guardado difiere del original.");
  }
  
  // Verificar Embedding
  console.log("\n--- VERIFICACIÓN DE EMBEDDING (OUT OpenAI) ---");
  console.log(`Dimensiones encontradas: ${dbDoc.emb_length}`);
  console.log(`Preview (primeros 5): [${dbDoc.emb_preview.join(', ')}]`);
  
  if (dbDoc.emb_length === 1536) {
    console.log("✅ RESULTADO: El vector tiene las 1536 dimensiones correctas.");
  } else {
    console.error(`❌ ERROR: Dimensiones incorrectas (${dbDoc.emb_length}).`);
  }
  
  if (dbDoc.all_zeros) {
    console.error("❌ ERROR: El vector contiene solo ceros.");
  } else {
    console.log("✅ RESULTADO: El vector contiene valores numéricos válidos (transformación exitosa).");
  }
}

validateIntegrity();
