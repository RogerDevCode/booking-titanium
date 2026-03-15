#!/usr/bin/env tsx
/**
 * Agrega workflowInputs al Execute Workflow Trigger de SUB_Seed_Single_Booking
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'qCCOLoAHJTl1BibE';

async function addWorkflowInputs() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    // 1. Obtener workflow actual
    console.log('[1/3] Obteniendo workflow...');
    const getResponse = await axios.get(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });

    const workflow = getResponse.data;
    
    // 2. Encontrar el trigger y agregar workflowInputs
    console.log('[2/3] Agregando workflowInputs...');
    
    const trigger = workflow.nodes.find((n: any) => n.name.includes('Trigger'));
    
    if (!trigger) {
      console.error('ERROR: No se encontró el nodo Execute Workflow Trigger');
      process.exit(1);
    }
    
    // Definir schema de inputs esperados
    trigger.parameters.workflowInputs = {
      schema: {
        type: 'object',
        properties: {
          calendar_id: {
            type: 'string',
            description: 'Google Calendar ID del proveedor'
          },
          provider_id: {
            type: 'integer',
            description: 'ID del proveedor'
          },
          service_id: {
            type: 'integer',
            description: 'ID del servicio'
          },
          start_time: {
            type: 'string',
            format: 'date-time',
            description: 'Hora de inicio de la reserva'
          },
          chat_id: {
            type: 'integer',
            description: 'Chat ID de Telegram del usuario'
          },
          user_name: {
            type: 'string',
            description: 'Nombre del usuario'
          },
          user_email: {
            type: 'string',
            format: 'email',
            description: 'Email del usuario'
          }
        },
        required: ['provider_id', 'service_id', 'start_time', 'chat_id', 'user_name', 'user_email']
      }
    };
    
    console.log('     workflowInputs agregado al trigger');

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

addWorkflowInputs();
