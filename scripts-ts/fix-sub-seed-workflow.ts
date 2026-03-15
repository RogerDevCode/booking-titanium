#!/usr/bin/env tsx
/**
 * Fix del workflow SUB_Seed_Single_Booking en n8n
 * Cambia $('X').item.json por $input.first().json
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'qCCOLoAHJTl1BibE';

async function fixWorkflow() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    // 1. Obtener workflow actual
    console.log('[1/3] Obteniendo workflow de n8n...');
    const getResponse = await axios.get(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });

    const workflow = getResponse.data;
    console.log(`     Workflow: ${workflow.name}`);
    
    // Debug: ver propiedades del workflow
    console.log(`     Propiedades workflow: ${Object.keys(workflow).join(', ')}`);

    // 2. Aplicar fix a los nodos
    console.log('[2/3] Aplicando fix de mapping...');
    
    // Debug: ver propiedades de cada nodo
    workflow.nodes.forEach((node: any) => {
      console.log(`     Nodo "${node.name}": ${Object.keys(node).join(', ')}`);
    });
    
    let changesCount = 0;
    
    workflow.nodes.forEach((node: any) => {
      if (node.parameters?.jsonBody) {
        const original = node.parameters.jsonBody;
        
        // Fix 1: $('Execute Workflow Trigger').item.json -> $input.first().json
        let fixed = original.replace(
          /\$\('Execute Workflow Trigger'\)\.item\.json/g,
          '$input.first().json'
        );
        
        // Fix 2: $('Create Booking (DAL)').item.json -> $('Create Booking (DAL)').first().json
        fixed = fixed.replace(
          /\$\('Create Booking \(DAL\)'\)\.item\.json/g,
          "$('Create Booking (DAL)').first().json"
        );
        
        if (original !== fixed) {
          node.parameters.jsonBody = fixed;
          changesCount++;
          console.log(`     ✓ Nodo "${node.name}" actualizado`);
        }
      }
    });

    if (changesCount === 0) {
      console.log('     No se requirieron cambios (ya está fixeado)');
    } else {
      console.log(`     Total nodos actualizados: ${changesCount}`);
    }

    // 3. Actualizar workflow en n8n
    console.log('[3/3] Actualizando workflow en n8n...');
    
    // Enviar solo propiedades estrictamente necesarias
    const updatePayload = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
      staticData: null,
      pinData: {}
    };
    
    console.log('     Enviando workflow actualizado (propiedades limpias)...');
    console.log(`     Nodos: ${workflow.nodes.length}`);
    
    const updateResponse = await axios.put(
      `${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`,
      updatePayload,
      {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY }
      }
    );

    if (updateResponse.data) {
      console.log('     ✅ Workflow actualizado exitosamente');
      console.log('');
      console.log('🎉 Fix completado!');
      console.log('');
      console.log('Siguiente paso: Ejecutar el workflow SEED para probar');
      console.log('  curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow');
    }

  } catch (error: any) {
    console.error('ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

fixWorkflow();
