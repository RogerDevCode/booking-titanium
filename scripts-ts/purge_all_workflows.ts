#!/usr/bin/env node
/**
 * =============================================================================
 * Purge All Workflows from Server
 * =============================================================================
 * Purpose: Delete ALL workflows from n8n server to start fresh
 * WARNING: This is destructive! Use with caution.
 * Usage: npx tsx scripts-ts/purge_all_workflows.ts
 * =============================================================================
 */

import axios, { AxiosInstance } from 'axios';
import { N8NConfig } from './config';

// Initialize config (loads .env automatically)
const config = new N8NConfig();

const N8N_API_URL = config.api_url;
const N8N_API_KEY = config.api_key;

const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const log = {
    info: (msg: string) => console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${msg}`),
    success: (msg: string) => console.log(`${COLORS.green}[SUCCESS]${COLORS.reset} ${msg}`),
    warning: (msg: string) => console.log(`${COLORS.yellow}[WARNING]${COLORS.reset} ${msg}`),
    error: (msg: string) => console.log(`${COLORS.red}[ERROR]${COLORS.reset} ${msg}`),
};

let api: AxiosInstance;

function initApi() {
    if (!N8N_API_KEY) {
        log.error('N8N_API_KEY not found in environment');
        process.exit(1);
    }

    api = axios.create({
      baseURL: `${N8N_API_URL}/api/v1`,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
}

async function getAllWorkflows() {
    try {
        const response = await api.get('/api/v1/workflows');
        return response.data.data || [];
    } catch (error: any) {
        log.error(`Failed to fetch workflows: ${error.message}`);
        return [];
    }
}

async function deleteWorkflow(id: string, name: string): Promise<boolean> {
    try {
        // First deactivate
        try {
            await api.post(`/api/v1/workflows/${id}/deactivate`);
        } catch (e) {
            // Ignore deactivation errors
        }
        
        await api.delete(`/api/v1/workflows/${id}`);
        return true;
    } catch (error: any) {
        return false;
    }
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log(`${COLORS.red}PURGE ALL WORKFLOWS FROM SERVER${COLORS.reset}`);
    console.log('='.repeat(70) + '\n');

    initApi();

    log.warning('This will DELETE ALL workflows from the n8n server!');
    console.log('\nThis is useful for:');
    console.log('  - Clearing corrupted workflow state');
    console.log('  - Starting fresh after propertyValues errors');
    console.log('  - Testing clean deployment\n');

    log.info('Fetching all workflows...');
    const workflows = await getAllWorkflows();
    
    log.success(`Found ${workflows.length} workflows\n`);

    if (workflows.length === 0) {
        log.info('No workflows to delete.');
        return;
    }

    console.log('Workflows to delete:');
    for (const wf of workflows) {
        console.log(`  • ${wf.name} (ID: ${wf.id})`);
    }
    console.log('');

    // Confirm deletion
    console.log(`${COLORS.yellow}Proceeding with deletion in 3 seconds...${COLORS.reset}\n`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    let deleted = 0;
    let failed = 0;

    for (const wf of workflows) {
        log.info(`Deleting: ${wf.name}...`);
        const success = await deleteWorkflow(wf.id, wf.name);
        
        if (success) {
            log.success(`✓ Deleted: ${wf.name}`);
            deleted++;
        } else {
            log.error(`✗ Failed to delete: ${wf.name}`);
            failed++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70));
    log.success(`Deleted: ${deleted}`);
    if (failed > 0) {
        log.error(`Failed: ${failed}`);
    }
    console.log('='.repeat(70) + '\n');

    log.info('Server is now clean. You can re-upload workflows from local files.');
}

main().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
