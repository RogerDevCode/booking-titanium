#!/usr/bin/env tsx
/**
 * Update HTTP Request nodes in WF2 to use internal Docker network
 * instead of Cloudflare tunnel (prevents timeout under load)
 */

import * as fs from 'fs';
import * as path from 'path';

const WF2_PATH = path.join(__dirname, '..', 'workflows', 'seed_clean', 'wf2_booking_orchestrator_v2_final.json');

// Internal Docker network URL
const INTERNAL_N8N_URL = 'http://n8n_titanium:5678';
const PUBLIC_N8N_URL = 'https://n8n.stax.ink';

function updateWorkflow() {
  console.log(`📝 Updating ${WF2_PATH}\n`);
  
  const workflow = JSON.parse(fs.readFileSync(WF2_PATH, 'utf-8'));
  
  let updatedCount = 0;
  
  // Find all HTTP Request nodes
  for (const node of workflow.nodes) {
    if (node.type === 'n8n-nodes-base.httpRequest') {
      const oldUrl = node.parameters.url;
      
      if (oldUrl && oldUrl.includes(PUBLIC_N8N_URL)) {
        const newUrl = oldUrl.replace(PUBLIC_N8N_URL, INTERNAL_N8N_URL);
        node.parameters.url = newUrl;
        
        // Add retry configuration if not present
        if (!node.parameters.retryOnFail) {
          node.parameters.retryOnFail = {
            maxTries: 3,
            waitBetweenTries: 1000,
            errorCodes: ['429', '500', '502', '503', '504']
          };
        }
        
        // Add timeout if not present
        if (!node.parameters.options) {
          node.parameters.options = {};
        }
        node.parameters.options.timeout = 30000; // 30s
        
        console.log(`✅ ${node.name}:`);
        console.log(`   OLD: ${oldUrl}`);
        console.log(`   NEW: ${newUrl}`);
        console.log(`   RETRY: ${node.parameters.retryOnFail.maxTries} tries, ${node.parameters.retryOnFail.waitBetweenTries}ms interval\n`);
        
        updatedCount++;
      }
    }
  }
  
  // Save updated workflow
  const backupPath = WF2_PATH + '.bak';
  fs.copyFileSync(WF2_PATH, backupPath);
  console.log(`💾 Backup created: ${backupPath}\n`);
  
  fs.writeFileSync(WF2_PATH, JSON.stringify(workflow, null, 2));
  
  console.log(`✅ Updated ${updatedCount} HTTP Request node(s)`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Review changes`);
  console.log(`   2. Upload to n8n: npx tsx scripts-ts/n8n_crud_agent.ts --update Z7g7DgxXQ61V368P ${WF2_PATH}`);
  console.log(`   3. Test workflow`);
}

updateWorkflow();
