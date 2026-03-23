/**
 * Descargar TODOS los workflows restantes desde n8n
 */

import axios from 'axios';
import * as fs from 'fs';

const API_URL = 'https://n8n.stax.ink/api/v1';
const API_KEY = process.env.X_N8N_API_KEY || process.env.N8N_API_KEY || '';
const OUTPUT_DIR = 'workflows';

// Workflows restantes (los que no son críticos pero faltan)
const REMAINING_WORKFLOWS = [
  'DB_Cancel_Booking',
  'DB_Find_Next_Available',
  'DB_Get_Availability',
  'GCAL_Delete_Event',
  'GMAIL_Send_Confirmation',
  'NN_00_Global_Error_Handler',
  'NN_01_Booking_Gateway',
  'NN_02_Message_Parser',
  'NN_04_Telegram_Sender',
  'NN_05_Reminder_Cron',
  'BB_00_Config',
  'FRONTEND_Landing_Page',
  'DB_Get_Providers',
  'DB_Get_Services',
  'DB_Get_Providers_By_Service',
  'SEED_Book_Tomorrow',
  'DB_Reschedule_Booking',
  'WF2_Booking_Orchestrator_Error_Handler',
  'WF4_Sync_Engine_Event_Driven',
  'Diagnostic Test',
  'WF1_Booking_API_Gateway_Async',
  'TEMP_Create_Test_Bookings_Table'
];

async function downloadWorkflow(name: string): Promise<boolean> {
  try {
    const listResp = await axios.get(`${API_URL}/workflows`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
    const wf = listResp.data.data.find((w: any) => w.name === name);
    
    if (!wf) {
      console.log(`  ⚠️  No encontrado: ${name}`);
      return false;
    }
    
    const resp = await axios.get(`${API_URL}/workflows/${wf.id}`, {
      headers: { 'X-N8N-API-KEY': API_KEY }
    });
    
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
  console.log('📥 Descargando workflows restantes...\n');
  
  let success = 0;
  let failed = 0;
  
  for (const name of REMAINING_WORKFLOWS) {
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
