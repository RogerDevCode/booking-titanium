#!/usr/bin/env tsx
/**
 * Fix del workflow SUB_Seed_Single_Booking en n8n - Versión simplificada
 * Obtiene el workflow, aplica fix, y lo sube
 */

import axios from 'axios';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_ID = 'qCCOLoAHJTl1BibE';
const OUTPUT_FILE = '/tmp/sub_seed_fixed.json';

async function fixAndUpload() {
  if (!N8N_API_KEY) {
    console.error('ERROR: N8N_API_KEY no configurada');
    process.exit(1);
  }

  try {
    // 1. Obtener workflow actual
    console.log('[1/4] Obteniendo workflow de n8n...');
    const getResponse = await axios.get(`${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY }
    });

    const workflow = getResponse.data;
    console.log(`     Workflow: ${workflow.name}`);

    // 2. Aplicar fix a los nodos
    console.log('[2/4] Aplicando fix de mapping...');
    
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

    console.log(`     Total cambios: ${changesCount}`);

    // 3. Guardar archivo temporal
    console.log('[3/4] Guardando archivo temporal...');
    
    // Estructura mínima requerida por n8n API
    const exportData = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings || {}
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exportData, null, 2));
    console.log(`     Guardado en: ${OUTPUT_FILE}`);

    // 4. Leer archivo y actualizar
    console.log('[4/4] Actualizando workflow en n8n...');
    
    const fileContent = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    
    const updateResponse = await axios.put(
      `${N8N_API_URL}/api/v1/workflows/${WORKFLOW_ID}`,
      fileContent,
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

fixAndUpload();
