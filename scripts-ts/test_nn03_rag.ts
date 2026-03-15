import fs from 'fs';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/nn-03-b-pipeline';

async function testAgentRAG() {
  console.log('--- TEST: Agente Pipeline (NN_03) + RAG Integration ---');
  
  const payload = {
    chat_id: 12345678,
    text: "cardiología"
  };

  console.log(`Usuario dice: "${payload.text}"`);
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json() as any;
    
    if (response.ok && result.success) {
      console.log('\n🤖 Respuesta del Agente:');
      console.log(result.data?.ai_response || result.data);
      console.log('\n--- METADATA ---');
      console.log(`Intent: ${result.data?.intent}`);
      console.log(`Workflow: ${result._meta?.workflow_id}`);
    } else {
      console.error('❌ Error en el Agente:', result.error_message || result);
    }
  } catch (error: any) {
    console.error('❌ Excepción:', error.message);
  }
}

testAgentRAG();
