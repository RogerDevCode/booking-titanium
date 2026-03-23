#!/usr/bin/env tsx
/**
 * extract-used-nodes.ts - Extrae nodos utilizados en workflows y crea subconjunto del SOT
 * 
 * USAGE:
 *   npx tsx scripts-ts/extract-used-nodes.ts
 * 
 * OUTPUT:
 *   scripts-ts/down-val-and-set-nodes/used-nodes.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const WORKFLOWS_DIR = path.join(__dirname, '../workflows');
const SOT_FILE = path.join(__dirname, 'down-val-and-set-nodes/ssot-nodes.json');
const OUTPUT_FILE = path.join(__dirname, 'down-val-and-set-nodes/used-nodes.json');

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function getAllWorkflowFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    console.error(`Directorio no encontrado: ${dir}`);
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...getAllWorkflowFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(path.join(dir, entry.name));
    }
  }
  
  return files;
}

function extractNodeTypesFromWorkflow(workflowPath: string): Set<string> {
  const nodeTypes = new Set<string>();
  
  try {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    const workflow = JSON.parse(content);
    
    if (workflow.nodes && Array.isArray(workflow.nodes)) {
      for (const node of workflow.nodes) {
        if (node.type) {
          nodeTypes.add(node.type);
        }
      }
    }
  } catch (error: any) {
    console.error(`Error procesando ${workflowPath}: ${error.message}`);
  }
  
  return nodeTypes;
}

function findNodeInSOT(nodeType: string, sotNodes: any[]): any | null {
  for (const node of sotNodes) {
    if (node.type === nodeType) {
      return node;
    }
  }
  return null;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔍 Extrayendo nodos utilizados en workflows...\n');
  
  // 1. Obtener todos los workflows
  const workflowFiles = getAllWorkflowFiles(WORKFLOWS_DIR);
  console.log(`📁 Encontrados ${workflowFiles.length} workflows en ${WORKFLOWS_DIR}`);
  
  // 2. Extraer todos los tipos de nodos únicos
  const allNodeTypes = new Set<string>();
  
  for (const wfFile of workflowFiles) {
    const types = extractNodeTypesFromWorkflow(wfFile);
    types.forEach(t => allNodeTypes.add(t));
  }
  
  console.log(`🏷️  Encontrados ${allNodeTypes.size} tipos de nodos únicos\n`);
  
  // 3. Cargar SOT original
  if (!fs.existsSync(SOT_FILE)) {
    console.error(`❌ Archivo SOT no encontrado: ${SOT_FILE}`);
    process.exit(1);
  }
  
  const sotContent = fs.readFileSync(SOT_FILE, 'utf-8');
  const sotData = JSON.parse(sotContent);
  
  console.log(`📚 SOT original: ${sotData.nodes.length} nodos totales\n`);
  
  // 4. Buscar cada nodo utilizado en el SOT
  const usedNodes: any[] = [];
  const notFound: string[] = [];
  
  for (const nodeType of Array.from(allNodeTypes).sort()) {
    const sotNode = findNodeInSOT(nodeType, sotData.nodes);
    
    if (sotNode) {
      usedNodes.push(sotNode);
      console.log(`✅ ${nodeType} → v${sotNode.latestVersion}`);
    } else {
      notFound.push(nodeType);
      console.log(`⚠️  ${nodeType} → NO ENCONTRADO en SOT`);
    }
  }
  
  // 5. Crear output
  const outputData = {
    _meta: {
      ...sotData._meta,
      extractedAt: new Date().toISOString(),
      sourceWorkflowsDir: WORKFLOWS_DIR,
      totalWorkflowsScanned: workflowFiles.length,
      totalNodesUsed: usedNodes.length,
      nodesNotFound: notFound.length
    },
    nodes: usedNodes
  };
  
  // 6. Guardar resultado
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2), 'utf-8');
  
  // 7. Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN');
  console.log('='.repeat(60));
  console.log(`Workflows escaneados: ${workflowFiles.length}`);
  console.log(`Nodos únicos encontrados: ${allNodeTypes.size}`);
  console.log(`Nodos en SOT: ${usedNodes.length}`);
  console.log(`Nodos no encontrados: ${notFound.length}`);
  console.log(`\n📁 Output guardado en: ${OUTPUT_FILE}`);
  
  if (notFound.length > 0) {
    console.log('\n⚠️  Nodos no encontrados en SOT (pueden ser personalizados o nuevos):');
    notFound.forEach(n => console.log(`   - ${n}`));
  }
  
  console.log('\n✅ ¡Extracción completada!');
}

// Run
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
