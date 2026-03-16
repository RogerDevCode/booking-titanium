#!/usr/bin/env tsx
/**
 * Compare workflows between temp/ (server) and workflows/seed_clean/ (local)
 */

import * as fs from 'fs';
import * as path from 'path';

const TEMP_DIR = path.join(__dirname, '..', 'temp');
const LOCAL_DIR = path.join(__dirname, '..', 'workflows', 'seed_clean');

interface WorkflowInfo {
  name: string;
  version?: string;
  nodes: number;
  active?: boolean;
  updatedAt?: string;
}

function getWorkflowInfo(filepath: string): WorkflowInfo {
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  return {
    name: data.name || 'Unknown',
    version: data.versionCounter || data.staticData?.version,
    nodes: data.nodes?.length || 0,
    active: data.active,
    updatedAt: data.updatedAt,
  };
}

function compareWorkflows() {
  console.log('🔍 COMPARANDO WORKFLOWS: SERVER (temp/) vs LOCAL (workflows/seed_clean/)\n');
  console.log('='.repeat(100));

  // Get server workflows
  const serverFiles = fs.readdirSync(TEMP_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  console.log(`\n📁 SERVER (temp/): ${serverFiles.length} workflows\n`);

  for (const serverFile of serverFiles) {
    const serverPath = path.join(TEMP_DIR, serverFile);
    const serverInfo = getWorkflowInfo(serverPath);

    // Try to find matching local file
    const localFile = serverFile; // Same name
    const localPath = path.join(LOCAL_DIR, localFile);

    const existsLocally = fs.existsSync(localPath);

    if (existsLocally) {
      const localInfo = getWorkflowInfo(localPath);

      // Compare
      const nodesMatch = serverInfo.nodes === localInfo.nodes;
      const nameMatch = serverInfo.name === localInfo.name;

      if (nodesMatch && nameMatch) {
        console.log(`✅ ${serverFile}`);
        console.log(`   SERVER: ${serverInfo.nodes} nodes | ${serverInfo.active ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`   LOCAL:  ${localInfo.nodes} nodes | ${localInfo.active ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`   → MATCH ✓\n`);
      } else {
        console.log(`⚠️  ${serverFile} - DIFFERENT`);
        console.log(`   SERVER: ${serverInfo.name} | ${serverInfo.nodes} nodes | ${serverInfo.active ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`   LOCAL:  ${localInfo.name} | ${localInfo.nodes} nodes | ${localInfo.active ? 'ACTIVE' : 'INACTIVE'}`);
        if (!nameMatch) {
          console.log(`   ⚠️  NAME MISMATCH!`);
        }
        if (!nodesMatch) {
          console.log(`   ⚠️  NODE COUNT MISMATCH! Difference: ${Math.abs(serverInfo.nodes - localInfo.nodes)} nodes`);
        }
        console.log(`   → REVIEW REQUIRED ⚠️\n`);
      }
    } else {
      // Try lowercase version
      const lowercaseFile = serverFile.toLowerCase();
      const lowercasePath = path.join(LOCAL_DIR, lowercaseFile);

      if (fs.existsSync(lowercasePath)) {
        const localInfo = getWorkflowInfo(lowercasePath);
        console.log(`✅ ${serverFile} (local: ${lowercaseFile})`);
        console.log(`   SERVER: ${serverInfo.nodes} nodes | ${serverInfo.active ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`   LOCAL:  ${localInfo.nodes} nodes | ${localInfo.active ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`   → MATCH ✓ (case difference)\n`);
      } else {
        console.log(`❌ ${serverFile}`);
        console.log(`   SERVER: ${serverInfo.nodes} nodes | ${serverInfo.active ? 'ACTIVE' : 'INACTIVE'}`);
        console.log(`   LOCAL:  NOT FOUND`);
        console.log(`   → MISSING IN LOCAL ❌\n`);
      }
    }
  }

  console.log('='.repeat(100));
  console.log('\n📁 LOCAL ONLY (in workflows/seed_clean/ but not on server):\n');

  // Get local-only workflows
  const localFiles = fs.readdirSync(LOCAL_DIR)
    .filter(f => f.endsWith('.json') && !serverFiles.includes(f) && !serverFiles.includes(f.toLowerCase()))
    .sort();

  if (localFiles.length === 0) {
    console.log('   (None)');
  } else {
    for (const localFile of localFiles) {
      const localPath = path.join(LOCAL_DIR, localFile);
      const localInfo = getWorkflowInfo(localPath);
      console.log(`   📄 ${localFile} - ${localInfo.nodes} nodes`);
    }
  }

  console.log('\n');
}

compareWorkflows();
