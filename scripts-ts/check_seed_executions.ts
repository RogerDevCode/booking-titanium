/**
 * Verifica ejecuciones recientes del workflow SEED_Book_Tomorrow
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY;

async function getSEEDExecutions() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  const workflowId = 'HxMojMqbRiNgquvd'; // SEED_Book_Tomorrow
  
  try {
    const response = await axios.get(`${N8N_API_URL}/executions`, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY
      },
      params: {
        workflowId,
        limit: 10,
        includeData: true
      }
    });

    console.log('='.repeat(70));
    console.log('📊 EJECUCIONES RECIENTES: SEED_Book_Tomorrow');
    console.log('='.repeat(70));
    console.log(`Workflow ID: ${workflowId}`);
    
    // La API devuelve { data: [...], next: '...' } o similar
    const executions = Array.isArray(response.data) ? response.data : response.data.data || [];
    console.log(`Total ejecuciones encontradas: ${executions.length}`);
    console.log('');

    if (executions.length === 0) {
      console.log('⚠️  No hay ejecuciones recientes para este workflow.');
      return;
    }

    executions.forEach((exec: any, i: number) => {
      const status = exec.status === 'success' ? '✅ OK' : exec.status === 'error' ? '❌ ERROR' : exec.status;
      const startedAt = new Date(exec.startedAt).toLocaleString();
      const duration = exec.stoppedAt ? 
        (new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()) / 1000 : 'N/A';
      
      console.log(`[Ejecución #${i + 1}]`);
      console.log(`  ID:         ${exec.id}`);
      console.log(`  Estado:     ${status}`);
      console.log(`  Iniciada:   ${startedAt}`);
      console.log(`  Duración:   ${duration}s`);
      console.log(`  Modo:       ${exec.mode}`);
      
      if (exec.data?.resultData?.error) {
        console.log(`  ERROR:      ${exec.data.resultData.error.message}`);
      }
      
      // Verificar si hay datos de salida
      const runData = exec.data?.resultData?.runData;
      if (runData) {
        const nodeNames = Object.keys(runData);
        console.log(`  Nodos ejecutados: ${nodeNames.join(', ')}`);
        
        // Verificar nodos con error
        nodeNames.forEach(nodeName => {
          const nodeExecutions = runData[nodeName];
          if (nodeExecutions && nodeExecutions.some((ne: any) => ne.error)) {
            console.log(`    ⚠️  Nodo ${nodeName} tuvo errores`);
          }
        });
      }
      
      console.log('');
    });

  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

getSEEDExecutions();
