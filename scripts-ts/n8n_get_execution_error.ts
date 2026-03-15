import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Find the real API key by parsing .env manually
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
let apiKey = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('N8N_API_KEY=')) {
    apiKey = line.split('=')[1].replace(/['"]/g, '');
    break;
  }
}

const N8N_URL = 'https://n8n.stax.ink';

if (!apiKey) {
  console.error('❌ N8N_API_KEY no encontrada en .env');
  process.exit(1);
}

const api = axios.create({
  baseURL: `${N8N_URL}/api/v1`,
  headers: { 'X-N8N-API-KEY': apiKey }
});

async function getLastExecutionError() {
  try {
    const res = await api.get('/executions', {
      params: { limit: 1, status: 'error' }
    });

    if (res.data.data.length === 0) {
      console.log('✅ No hay ejecuciones fallidas recientes.');
      return;
    }

    const execId = res.data.data[0].id;
    const detailRes = await api.get(`/executions/${execId}?includeData=true`);
    const detail = detailRes.data;

    console.log(`\n🔴 ÚLTIMO ERROR DE N8N (Exec ID: ${execId} | Workflow: ${detail.workflowId})`);
    
    const resultData = detail.data?.resultData || {};
    const runData = resultData.runData || {};
    const lastNodeExecuted = resultData.lastNodeExecuted;

    console.log(`🛑 Nodo donde falló: ${lastNodeExecuted}`);

    if (resultData.error) {
      console.log(`\n📄 Mensaje de Error (Global):`);
      console.log(`   ${resultData.error.message}`);
    }

    if (lastNodeExecuted && runData[lastNodeExecuted]) {
      const nodeRuns = runData[lastNodeExecuted];
      const lastRun = nodeRuns[nodeRuns.length - 1];

      if (lastRun.error) {
         console.log(`\n🔍 Error detallado del nodo [${lastNodeExecuted}]:`);
         console.log(JSON.stringify(lastRun.error, null, 2));
      }
    }

  } catch (error: any) {
    console.error('❌ Error consultando la API de n8n:', error.message);
  }
}

getLastExecutionError();
