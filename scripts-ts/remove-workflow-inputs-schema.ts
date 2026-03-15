#!/usr/bin/env tsx
/**
 * Elimina workflowInputs.schema del nodo Execute Sub-workflow
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'HxMojMqbRiNgquvd';

async function removeSchema() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    console.log('[1/3] Obteniendo workflow...');
    const getResponse = await axios.get(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      timeout: 15000
    });

    const workflow = getResponse.data;
    
    console.log('[2/3] Eliminando workflowInputs.schema...');
    
    const executeNode = workflow.nodes.find((n: any) => n.name === 'Execute Sub-workflow');
    
    if (executeNode) {
      // Eliminar solo el schema, mantener values si existe
      if (executeNode.parameters.workflowInputs) {
        delete executeNode.parameters.workflowInputs.schema;
        console.log('     schema eliminado');
      } else {
        console.log('     workflowInputs no existe, creando uno simple...');
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
          mode: 'pairs'
        };
      }
    }

    console.log('[3/3] Actualizando workflow...');
    
    const updatePayload = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {}
    };
    
    const updateResponse = await axios.put(
      `${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`,
      updatePayload,
      {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY },
        timeout: 15000
      }
    );

    console.log('     ✅ Workflow actualizado');
    console.log('');
    console.log('🎉 Fix completado!');

  } catch (error: any) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error('ERROR: Timeout - la API de n8n está lenta');
    } else {
      console.error('ERROR:', error.response?.data || error.message);
    }
    process.exit(1);
  }
}

removeSchema();
