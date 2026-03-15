#!/usr/bin/env tsx
/**
 * WF2 Debug Script - Aplicando SECCION 5 del manual n8n-debug-api-manual.txt
 */
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink/api/v1';
const API_KEY = process.env.X_N8N_API_KEY || process.env.N8N_API_KEY;

const WF2_ID = 'Z7g7DgxXQ61V368P';  // WF2_Booking_Orchestrator

async function debugWF2() {
  console.log('=== WF2 DEBUG - SECCION 5 MANUAL ===\n');
  
  // PASO 1: Encontrar últimas ejecuciones con error
  console.log('PASO 1: Buscando ejecuciones con error...');
  const executionsRes = await axios.get(
    `${BASE_URL}/executions?workflowId=${WF2_ID}&status=error&limit=3`,
    {
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const executions = executionsRes.data.data || [];
  console.log(`Encontradas ${executions.length} ejecuciones con error\n`);
  
  if (executions.length === 0) {
    console.log('No hay ejecuciones con error recientes. Trigger error?');
    return;
  }
  
  // PASO 2-5: Para cada ejecución, obtener detalle
  for (const exec of executions) {
    console.log(`\n=== Execution: ${exec.id} ===`);
    console.log(`Started: ${exec.startedAt}`);
    console.log(`Status: ${exec.status}`);
    console.log(`Mode: ${exec.mode}`);
    
    try {
      const detailRes = await axios.get(
        `${BASE_URL}/executions/${exec.id}?includeData=true`,
        {
          headers: {
            'X-N8N-API-KEY': API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const detail = detailRes.data;
      
      // PASO 3: Identificar nodo fallido
      if (detail.data?.resultData?.error) {
        console.log('\n🔴 WORKFLOW ERROR:');
        console.log(`  Nodo: ${detail.data.resultData.error.node?.name || 'N/A'}`);
        console.log(`  Mensaje: ${detail.data.resultData.error.message?.substring(0, 200)}`);
      }
      
      // Ultimo nodo ejecutado
      if (detail.data?.resultData?.lastNodeExecuted) {
        console.log(`\n📍 Ultimo nodo ejecutado: ${detail.data.resultData.lastNodeExecuted}`);
      }
      
      // PASO 4-5: Ver outputs de cada nodo
      if (detail.data?.resultData?.runData) {
        console.log('\n📊 Nodos ejecutados:');
        const runData = detail.data.resultData.runData;
        
        for (const [nodeName, runs] of Object.entries(runData) as any) {
          const run = runs[0];
          const status = run.executionStatus;
          const time = run.executionTime;
          
          if (status === 'error') {
            console.log(`  ❌ ${nodeName}: ERROR - ${run.error?.message?.substring(0, 100)}`);
            if (run.error?.httpCode) {
              console.log(`     HTTP Code: ${run.error.httpCode}`);
            }
          } else {
            console.log(`  ✅ ${nodeName}: OK (${time}ms)`);
          }
        }
      } else {
        console.log('\n⚠️  runData: null - Verificar configuracion de guardado (SECCION 2 manual)');
      }
      
    } catch (error: any) {
      console.log(`Error obteniendo detalle: ${error.response?.status} - ${error.message}`);
      if (error.response?.status === 524) {
        console.log('⚠️  Timeout Cloudflare (100s) - Ver SECCION 7 punto 5b del manual');
      }
    }
    
    console.log('\n' + '='.repeat(50));
  }
}

debugWF2().catch(console.error);
