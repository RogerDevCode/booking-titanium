#!/usr/bin/env tsx
/**
 * WF2 Config Check - Verificar configuración del workflow
 */
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink/api/v1';
const API_KEY = process.env.X_N8N_API_KEY || process.env.N8N_API_KEY;

const WF2_ID = 'Z7g7DgxXQ61V368P';

async function checkWF2Config() {
  console.log('=== WF2 CONFIG CHECK ===\n');
  
  // Obtener configuración del workflow
  const wfRes = await axios.get(
    `${BASE_URL}/workflows/${WF2_ID}`,
    {
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  
  const wf = wfRes.data;
  
  console.log(`Name: ${wf.name}`);
  console.log(`Active: ${wf.active}`);
  console.log(`CreatedAt: ${wf.createdAt}`);
  console.log(`UpdatedAt: ${wf.updatedAt}`);
  
  console.log('\n📋 Settings:');
  console.log(`  executionOrder: ${wf.settings?.executionOrder || 'default'}`);
  console.log(`  saveDataErrorExecution: ${wf.settings?.saveDataErrorExecution || 'default'}`);
  console.log(`  saveDataSuccessExecution: ${wf.settings?.saveDataSuccessExecution || 'default'}`);
  console.log(`  saveManualExecutions: ${wf.settings?.saveManualExecutions || 'default'}`);
  console.log(`  saveExecutionProgress: ${wf.settings?.saveExecutionProgress || 'default'}`);
  
  console.log('\n📊 Nodes:');
  wf.nodes?.forEach((node: any) => {
    console.log(`  - ${node.name} (${node.type} v${node.typeVersion})`);
  });
  
  console.log('\n🔌 Webhook nodes:');
  const webhookNodes = wf.nodes?.filter((n: any) => n.type === 'n8n-nodes-base.webhook');
  webhookNodes?.forEach((node: any) => {
    console.log(`  - ${node.name}`);
    console.log(`    path: ${node.parameters?.path}`);
    console.log(`    httpMethod: ${node.parameters?.httpMethod}`);
    console.log(`    webhookId: ${node.webhookId}`);
  });
}

checkWF2Config().catch(console.error);
