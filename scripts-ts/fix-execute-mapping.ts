#!/usr/bin/env tsx
/**
 * Agrega mapping de inputs al nodo Execute Sub-workflow en SEED_Book_Tomorrow
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'HxMojMqbRiNgquvd'; // SEED_Book_Tomorrow

async function addExecuteMapping() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    // 1. Obtener workflow actual
    console.log('[1/3] Obteniendo workflow SEED...');
    const getResponse = await axios.get(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });

    const workflow = getResponse.data;
    
    // 2. Encontrar el nodo Execute Sub-workflow y agregar mapping
    console.log('[2/3] Agregando mapping de inputs...');
    
    const executeNode = workflow.nodes.find((n: any) => n.name === 'Execute Sub-workflow');
    
    if (!executeNode) {
      console.error('ERROR: No se encontró el nodo Execute Sub-workflow');
      process.exit(1);
    }
    
    // Agregar mapping explícito de inputs
    executeNode.parameters.workflowInputs = {
      schema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Google Calendar ID'
          },
          provider_id: {
            type: 'integer',
            description: 'Provider ID'
          },
          service_id: {
            type: 'integer',
            description: 'Service ID'
          },
          start_time: {
            type: 'string',
            format: 'date-time',
            description: 'Start time'
          },
          chat_id: {
            type: 'integer',
            description: 'Telegram chat ID'
          },
          user_name: {
            type: 'string',
            description: 'User name'
          },
          user_email: {
            type: 'string',
            format: 'email',
            description: 'User email'
          }
        },
        required: ['provider_id', 'service_id', 'start_time', 'chat_id', 'user_name', 'user_email']
      },
      // Mapeo de valores desde el output del nodo anterior
      values: {
        calendar_id: '={{ "primary" }}', // Calendar ID por defecto
        provider_id: '={{ $json.provider_id }}',
        service_id: '={{ $json.service_id }}',
        start_time: '={{ $json.start_time }}',
        chat_id: '={{ $json.chat_id }}',
        user_name: '={{ $json.user_name }}',
        user_email: '={{ $json.user_email }}'
      }
    };
    
    console.log('     workflowInputs agregado al nodo Execute Sub-workflow');

    // 3. Actualizar workflow
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
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }
      }
    );

    console.log('     ✅ Workflow actualizado');
    console.log('');
    console.log('🎉 Fix completado!');
    console.log('');
    console.log('Prueba: curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow');

  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

addExecuteMapping();
