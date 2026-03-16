#!/usr/bin/env tsx
/**
 * Download all workflows from n8n server to temp/ directory
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY || process.env.N8N_ACCESS_TOKEN || '';

const TEMP_DIR = path.join(__dirname, '..', 'temp');

async function downloadWorkflows() {
  if (!N8N_API_KEY) {
    console.error('❌ N8N_API_KEY not found in .env');
    process.exit(1);
  }

  console.log(`📥 Downloading workflows from ${N8N_API_URL}`);
  console.log(`📁 Saving to ${TEMP_DIR}\n`);

  // Create temp directory
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const headers = {
    'X-N8N-API-Key': N8N_API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    // Get all workflows
    const listRes = await axios.get(`${N8N_API_URL}/api/v1/workflows`, { headers });
    const workflows = listRes.data.data || [];

    console.log(`✓ Found ${workflows.length} workflow(s)\n`);

    // Download each workflow
    for (const wf of workflows) {
      const wfId = wf.id;
      const wfName = wf.name || 'Unnamed';
      
      try {
        const detailRes = await axios.get(`${N8N_API_URL}/api/v1/workflows/${wfId}`, { headers });
        const workflowData = detailRes.data;

        // Sanitize filename
        const safeName = wfName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${safeName}.json`;
        const filepath = path.join(TEMP_DIR, filename);

        // Save workflow
        fs.writeFileSync(filepath, JSON.stringify(workflowData, null, 2));

        const status = workflowData.active ? 'ACTIVE' : 'INACTIVE';
        console.log(`  [${status}] ${wfName} → ${filename}`);
      } catch (e: any) {
        console.error(`  ❌ Error downloading ${wfName}: ${e.message}`);
      }
    }

    console.log(`\n✅ Download complete!`);
    console.log(`📁 Workflows saved to: ${TEMP_DIR}`);
  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}

downloadWorkflows();
