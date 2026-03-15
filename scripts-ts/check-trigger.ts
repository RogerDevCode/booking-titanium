#!/usr/bin/env tsx
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;

async function checkTrigger() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    const response = await axios.get(`${N8N_API_URL}/api/v1/workflows/qCCOLoAHJTl1BibE`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });

    const workflow = response.data;
    const trigger = workflow.nodes.find((n: any) => n.name.includes('Trigger'));
    
    console.log('Nodo Execute Workflow Trigger:');
    console.log(JSON.stringify(trigger, null, 2));
    
  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
  }
}

checkTrigger();
