/**
 * Auditoría de sincronización Local vs Remoto
 * =============================================
 * 
 * Detecta:
 * 1. Workflows en remoto sin archivo local
 * 2. Workflows locales sin archivo JSON actualizado
 * 3. Workflows con versiones diferentes (updatedAt)
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const API_URL = 'https://n8n.stax.ink/api/v1';
const API_KEY = process.env.X_N8N_API_KEY || process.env.N8N_API_KEY || '';
const LOCAL_WORKFLOWS_DIR = 'workflows';

interface RemoteWorkflow {
  id: string;
  name: string;
  active: boolean;
  updatedAt: string;
  versionId: string;
}

interface SyncStatus {
  name: string;
  remoteId?: string;
  localFile?: string;
  remoteUpdatedAt?: string;
  localUpdatedAt?: string;
  status: 'SYNC' | 'DESYNC' | 'REMOTE_ONLY' | 'LOCAL_ONLY';
  issue?: string;
}

async function getRemoteWorkflows(): Promise<RemoteWorkflow[]> {
  const resp = await axios.get(`${API_URL}/workflows`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  });
  
  return resp.data.data.map((wf: any) => ({
    id: wf.id,
    name: wf.name,
    active: wf.active,
    updatedAt: wf.updatedAt,
    versionId: wf.versionId
  }));
}

function getLocalWorkflows(): Map<string, { file: string, updatedAt?: string }> {
  const local = new Map<string, { file: string, updatedAt?: string }>();
  
  const files = fs.readdirSync(LOCAL_WORKFLOWS_DIR);
  
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    
    try {
      const content = fs.readFileSync(path.join(LOCAL_WORKFLOWS_DIR, file), 'utf-8');
      const wf = JSON.parse(content);
      
      // Normalizar nombre (quitar .json del filename)
      const name = wf.name || file.replace('.json', '');
      local.set(name, {
        file: path.join(LOCAL_WORKFLOWS_DIR, file),
        updatedAt: wf.updatedAt
      });
    } catch (err) {
      console.warn(`⚠️  Error leyendo ${file}: ${err}`);
    }
  }
  
  return local;
}

async function auditSync(): Promise<SyncStatus[]> {
  const remote = await getRemoteWorkflows();
  const local = getLocalWorkflows();
  const results: SyncStatus[] = [];
  
  // Check remoto → local
  for (const wf of remote) {
    const localWf = local.get(wf.name);
    
    if (!localWf) {
      results.push({
        name: wf.name,
        remoteId: wf.id,
        status: 'REMOTE_ONLY',
        issue: 'Existe en remoto pero NO tiene archivo local'
      });
    } else {
      // Comparar fechas
      const remoteDate = new Date(wf.updatedAt).getTime();
      const localDate = localWf.updatedAt ? new Date(localWf.updatedAt).getTime() : 0;
      
      if (remoteDate > localDate + 60000) { // +1 minuto margen
        results.push({
          name: wf.name,
          remoteId: wf.id,
          localFile: localWf.file,
          remoteUpdatedAt: wf.updatedAt,
          localUpdatedAt: localWf.updatedAt,
          status: 'DESYNC',
          issue: `Remoto más reciente por ${Math.round((remoteDate - localDate) / 60000)} minutos`
        });
      } else {
        results.push({
          name: wf.name,
          remoteId: wf.id,
          localFile: localWf.file,
          status: 'SYNC'
        });
      }
    }
  }
  
  // Check local → remoto
  for (const [name, localWf] of local.entries()) {
    const remoteWf = remote.find(r => r.name === name);
    
    if (!remoteWf) {
      results.push({
        name,
        localFile: localWf.file,
        status: 'LOCAL_ONLY',
        issue: 'Existe localmente pero NO en remoto'
      });
    }
  }
  
  return results;
}

async function main() {
  console.log('🔍 Auditoría de sincronización Local ↔ Remoto\n');
  
  const results = await auditSync();
  
  const sync = results.filter(r => r.status === 'SYNC');
  const desync = results.filter(r => r.status === 'DESYNC');
  const remoteOnly = results.filter(r => r.status === 'REMOTE_ONLY');
  const localOnly = results.filter(r => r.status === 'LOCAL_ONLY');
  
  console.log('='.repeat(80));
  console.log('📊 RESUMEN:');
  console.log(`  ✅ SYNC:        ${sync.length}`);
  console.log(`  ⚠️  DESYNC:      ${desync.length}`);
  console.log(`  📡 REMOTE_ONLY: ${remoteOnly.length}`);
  console.log(`  📁 LOCAL_ONLY:  ${localOnly.length}`);
  console.log('='.repeat(80));
  
  if (desync.length > 0) {
    console.log('\n⚠️  DESENCRONIZADOS (Remoto más reciente que local):');
    for (const r of desync) {
      console.log(`  • ${r.name}`);
      console.log(`    Remote: ${r.remoteUpdatedAt}`);
      console.log(`    Local:  ${r.localUpdatedAt || 'N/A'}`);
      console.log(`    Issue:  ${r.issue}`);
    }
  }
  
  if (remoteOnly.length > 0) {
    console.log('\n📡 SOLO EN REMOTO (sin archivo local):');
    for (const r of remoteOnly) {
      console.log(`  • ${r.name} (ID: ${r.remoteId})`);
      console.log(`    Issue: ${r.issue}`);
    }
  }
  
  if (localOnly.length > 0) {
    console.log('\n📁 SOLO EN LOCAL (sin workflow remoto):');
    for (const r of localOnly) {
      console.log(`  • ${r.name}`);
      console.log(`    File: ${r.localFile}`);
    }
  }
  
  // Exportar reporte
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      sync: sync.length,
      desync: desync.length,
      remoteOnly: remoteOnly.length,
      localOnly: localOnly.length
    },
    details: results
  };
  
  fs.writeFileSync('sync_audit_report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Reporte completo: sync_audit_report.json');
  
  // Generar script de descarga para los desincronizados
  if (remoteOnly.length > 0 || desync.length > 0) {
    console.log('\n💡 Para descargar workflows faltantes/desincronizados:');
    console.log('   npx tsx scripts-ts/download_workflow.ts --name "<workflow_name>"\n');
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
