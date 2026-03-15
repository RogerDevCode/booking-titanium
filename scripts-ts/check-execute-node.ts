#!/usr/bin/env tsx
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const SEED_WORKFLOW_ID = 'HxMojMqbRiNgquvd';

async function checkExecuteNode() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    const response = await axios.get(`${N8N_API_URL}/api/v1/workflows/${SEED_WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });

    const workflow = response.data;
    const executeNode = workflow.nodes.find((n: any) => n.name.includes('Execute Sub'));
    
    console.log('Nodo Execute Sub-workflow:');
    console.log(JSON.stringify(executeNode, null, 2));
    
  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

checkExecuteNode();
