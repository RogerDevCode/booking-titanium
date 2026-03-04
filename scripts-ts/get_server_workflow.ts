#!/usr/bin/env node
/**
 * =============================================================================
 * Get Workflow Details from Server
 * =============================================================================
 * Purpose: Fetch full workflow JSON from n8n server to compare with local files
 * Usage: npx tsx scripts-ts/get_server_workflow.ts <workflow-name-or-id>
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const N8N_API_URL = process.env.N8N_API_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;

let api: AxiosInstance;

function initApi() {
    if (!N8N_API_KEY) {
        console.error('N8N_API_KEY not found');
        process.exit(1);
    }

    api = axios.create({
        baseURL: N8N_API_URL,
        headers: {
            'X-N8N-API-KEY': N8N_API_KEY,
            'Content-Type': 'application/json',
        },
        timeout: 30000,
    });
}

async function getWorkflow(identifier: string) {
    try {
        const response = await api.get(`/api/v1/workflows/${identifier}`);
        return response.data;
    } catch (error: any) {
        console.error(`Failed to fetch workflow: ${error.message}`);
        return null;
    }
}

async function main() {
    const identifier = process.argv[2];

    if (!identifier) {
        console.log('Usage: npx tsx scripts-ts/get_server_workflow.ts <workflow-id>');
        console.log('\nProblematic workflow IDs:');
        console.log('  GCAL_Create_Event: bc8zMLI9O5ytO7a2 (may be deleted)');
        console.log('  NN_04_Telegram_Sender: 4afRuMkIvgEh7gXt (may be deleted)\n');
        process.exit(1);
    }

    initApi();

    console.log(`Fetching workflow: ${identifier}...\n`);
    const workflow = await getWorkflow(identifier);

    if (!workflow) {
        console.error('Workflow not found!');
        process.exit(1);
    }

    // Save to file
    const outputPath = path.join(__dirname, `server_${workflow.name || identifier}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2));
    
    console.log(`✓ Saved to: ${outputPath}\n`);
    
    // Show node summary
    console.log('NODES:');
    console.log('-'.repeat(70));
    for (const node of workflow.nodes || []) {
        console.log(`  ${node.name} (${node.type} v${node.typeVersion})`);
        
        // Show parameters structure
        if (node.parameters) {
            for (const [key, value] of Object.entries(node.parameters)) {
                if (typeof value === 'object' && value !== null) {
                    const isArray = Array.isArray(value);
                    console.log(`    - ${key}: ${isArray ? 'array' : 'object'} (${Object.keys(value).length} keys)`);
                } else {
                    console.log(`    - ${key}: ${typeof value}`);
                }
            }
        }
        console.log('');
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
