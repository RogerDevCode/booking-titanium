#!/usr/bin/env tsx
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;

async function checkExecutions() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    // Obtener últimas 5 ejecuciones globales
    const response = await axios.get(`${N8N_API_URL}/api/v1/executions`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      params: { limit: 5, includeData: true }
    });

    const executions = Array.isArray(response.data) ? response.data : response.data.data || [];
    console.log(`Últimas ${executions.length} ejecuciones:`);
    console.log('');
    
    if (executions.length === 0) {
      console.log('No hay ejecuciones recientes.');
      return;
    }
    
    executions.forEach((exec: any, i: number) => {
      const status = exec.status === 'success' ? '✅' : exec.status === 'error' ? '❌' : exec.status;
      const time = new Date(exec.startedAt).toLocaleTimeString();
      const workflowName = exec.workflowData?.name || 'N/A';
      
      console.log(`[${i+1}] ${status} ${time} - ${workflowName} (ID: ${exec.id})`);
      
      if (exec.status === 'error' && exec.data?.resultData?.error) {
        console.log(`    ERROR: ${exec.data.resultData.error.message}`);
      }
      
      // Verificar runData para errores de nodos
      if (exec.data?.resultData?.runData) {
        Object.entries(exec.data.resultData.runData).forEach(([nodeName, nodeExec]: [string, any]) => {
          if (nodeExec?.[0]?.error) {
            console.log(`    ❌ Nodo ${nodeName}: ${nodeExec[0].error.message}`);
          }
        });
      }
    });
    
  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

checkExecutions();
