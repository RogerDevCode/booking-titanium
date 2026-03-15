#!/usr/bin/env tsx
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;

// IDs de workflows
const SEED_WORKFLOW_ID = 'HxMojMqbRiNgquvd'; // SEED_Book_Tomorrow
const SUB_SEED_WORKFLOW_ID = 'qCCOLoAHJTl1BibE'; // SUB_Seed_Single_Booking

async function checkSeedExecutions() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    console.log('='.repeat(70));
    console.log('EJECUCIONES: SEED_Book_Tomorrow');
    console.log('='.repeat(70));
    
    // Obtener ejecuciones del workflow SEED
    const response = await axios.get(`${N8N_API_URL}/api/v1/executions`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      params: { workflowId: SEED_WORKFLOW_ID, limit: 5, includeData: true }
    });

    const executions = Array.isArray(response.data) ? response.data : response.data.data || [];
    
    console.log(`Workflow ID: ${SEED_WORKFLOW_ID}`);
    console.log(`Ejecuciones encontradas: ${executions.length}`);
    console.log('');
    
    if (executions.length === 0) {
      console.log('⚠️ No hay ejecuciones para este workflow.');
      console.log('');
      console.log('Nota: El webhook puede estar fallando antes de registrar la ejecución.');
      return;
    }
    
    executions.forEach((exec: any, i: number) => {
      const status = exec.status === 'success' ? '✅ OK' : exec.status === 'error' ? '❌ ERROR' : exec.status;
      const time = new Date(exec.startedAt).toLocaleString();
      
      console.log(`[Ejecución #${i + 1}]`);
      console.log(`  ID:       ${exec.id}`);
      console.log(`  Estado:   ${status}`);
      console.log(`  Tiempo:   ${time}`);
      console.log(`  Modo:     ${exec.mode}`);
      
      if (exec.data?.resultData?.error) {
        console.log(`  ERROR:    ${exec.data.resultData.error.message}`);
      }
      
      // Verificar runData
      if (exec.data?.resultData?.runData) {
        const nodes = Object.keys(exec.data.resultData.runData);
        console.log(`  Nodos:    ${nodes.join(', ')}`);
        
        // Buscar errores por nodo
        nodes.forEach(nodeName => {
          const nodeExec = exec.data.resultData.runData[nodeName];
          if (nodeExec?.[0]?.error) {
            console.log(`    ❌ ${nodeName}: ${nodeExec[0].error.message}`);
          } else {
            const outputCount = nodeExec?.[0]?.data?.main?.[0]?.length || 0;
            console.log(`    ✅ ${nodeName}: ${outputCount} items`);
          }
        });
      }
      
      console.log('');
    });
    
  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

checkSeedExecutions();
