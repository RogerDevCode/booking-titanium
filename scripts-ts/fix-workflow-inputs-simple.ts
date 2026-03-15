#!/usr/bin/env tsx
/**
 * Fix: Simplificar workflowInputs para compatibilidad con n8n v2.10
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'HxMojMqbRiNgquvd'; // SEED_Book_Tomorrow

async function fixSchema() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    console.log('[1/3] Obteniendo workflow SEED...');
    const getResponse = await axios.get(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });

    const workflow = getResponse.data;
    const executeNode = workflow.nodes.find((n: any) => n.name === 'Execute Sub-workflow');
    
    console.log('[2/3] Simplificando workflowInputs...');
    
    // Usar formato simplificado compatible con n8n v2.10
    executeNode.parameters.workflowInputs = {
      __rl: true,
      value: {
        calendar_id: 'primary',
        provider_id: '={{ $json.provider_id }}',
        service_id: '={{ $json.service_id }}',
        start_time: '={{ $json.start_time }}',
        chat_id: '={{ $json.chat_id }}',
        user_name: '={{ $json.user_name }}',
        user_email: '={{ $json.user_email }}'
      },
      mode: "pairs"
    };
    
    console.log('     workflowInputs simplificado');

    console.log('[3/3] Actualizando workflow...');
    
    const updatePayload = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {}
    };
    
    await axios.put(
      `${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`,
      updatePayload,
      {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }
      }
    );

    console.log('     ✅ Workflow actualizado');
    console.log('');
    console.log('🎉 Fix completado!');

  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

fixSchema();
