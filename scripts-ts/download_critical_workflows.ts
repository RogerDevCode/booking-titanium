/**
 * Descargar workflows críticos desde n8n
 * ========================================
 * 
 * Descarga los workflows que están en remoto pero no tienen archivo local
 */

import axios from 'axios';
import * as fs from 'fs';

const API_URL = 'https://n8n.stax.ink/api/v1';
const API_KEY = process.env.X_N8N_API_KEY || process.env.N8N_API_KEY || '';
const OUTPUT_DIR = 'workflows';

// Workflows críticos a descargar (prioridad alta)
const CRITICAL_WORKFLOWS = [
  'WF2_Booking_Orchestrator',
  'WF1_Booking_API_Gateway',
  'WF3_Availability_Service',
  'WF4_Sync_Engine',
  'WF5_GCal_Collision_Check',
  'WF6_Rollback_Workflow',
  'WF7_Distributed_Lock_System',
  'WF8_Booking_Queue_Worker',
  'WF9_Booking_Intent_Status',
  'CB_GCal_Circuit_Breaker',
  'DLQ_01_Add_Entry',
  'DLQ_02_Get_Status',
  'DLQ_Retry',
  'NN_03_AI_Agent',
  'TEST_GCal_Connection',
  'TEST_GCal_Minimal'
];

async function downloadWorkflow(name: string): Promise<boolean> {
  try {
    // Listar workflows para encontrar el ID
    const listResp = await axios.get(`${API_URL}/workflows`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
    const wf = listResp.data.data.find((w: any) => w.name === name);
    
    if (!wf) {
      console.log(`  ⚠️  No encontrado: ${name}`);
      return false;
    }
    
    // Obtener workflow completo
    const resp = await axios.get(`${API_URL}/workflows/${wf.id}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
    // Guardar archivo
    const filename = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const filepath = `${OUTPUT_DIR}/${filename}`;
    
    fs.writeFileSync(filepath, JSON.stringify(resp.data, null, 2));
    
    console.log(`  ✅ ${name} → ${filepath}`);
    return true;
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('📥 Descargando workflows críticos...\n');
  
  let success = 0;
  let failed = 0;
  
  for (const name of CRITICAL_WORKFLOWS) {
    const result = await downloadWorkflow(name);
    if (result) success++;
    else failed++;
  }
  
  console.log(`\n📊 Resumen: ${success} descargados | ${failed} fallidos`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
