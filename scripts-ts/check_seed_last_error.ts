/**
 * Obtiene el detalle del error de la última ejecución del workflow SEED
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY;

async function getLastError() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  const workflowId = 'HxMojMqbRiNgquvd'; // SEED_Book_Tomorrow
  
  try {
    // Obtener última ejecución
    const execResponse = await axios.get(`${N8N_API_URL}/executions`, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY
      },
      params: {
        workflowId,
        limit: 1,
        includeData: true
      }
    });

    const executions = Array.isArray(execResponse.data) ? execResponse.data : execResponse.data.data || [];
    
    if (executions.length === 0) {
      console.log('No hay ejecuciones para este workflow');
      return;
    }

    const exec = executions[0];
    console.log('='.repeat(70));
    console.log('🔍 ÚLTIMA EJECUCIÓN: SEED_Book_Tomorrow');
    console.log('='.repeat(70));
    console.log(`ID:         ${exec.id}`);
    console.log(`Estado:     ${exec.status}`);
    console.log(`Iniciada:   ${new Date(exec.startedAt).toLocaleString()}`);
    console.log(`Detenida:   ${new Date(exec.stoppedAt).toLocaleString()}`);
    console.log(`Modo:       ${exec.mode}`);
    console.log('');

    if (exec.data?.resultData?.error) {
      console.log('❌ ERROR DETECTADO:');
      console.log(`  Mensaje:    ${exec.data.resultData.error.message}`);
      console.log(`  Stack:      ${exec.data.resultData.error.stack?.substring(0, 500)}`);
      console.log('');
    }

    // Analizar runData para ver errores por nodo
    const runData = exec.data?.resultData?.runData;
    if (runData) {
      console.log('📊 NODOS EJECUTADOS:');
      Object.keys(runData).forEach(nodeName => {
        const nodeExecutions = runData[nodeName];
        const nodeExec = nodeExecutions?.[0];
        
        if (nodeExec?.error) {
          console.log(`\n  ❌ NODO: ${nodeName}`);
          console.log(`     Error: ${nodeExec.error.message}`);
          if (nodeExec.error.description) {
            console.log(`     Desc:  ${nodeExec.error.description}`);
          }
        } else {
          const outputCount = nodeExec?.data?.main?.[0]?.length || 0;
          console.log(`  ✅ NODO: ${nodeName} (${outputCount} items)`);
        }
      });
    }

  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

getLastError();
