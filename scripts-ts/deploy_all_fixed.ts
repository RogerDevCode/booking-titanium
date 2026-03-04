#!/usr/bin/env node
/**
 * =============================================================================
 * Deploy All Workflows with Fixed Node Versions
 * =============================================================================
 * Purpose: Fix node versions in all workflows and deploy to n8n server
 * Usage: npx tsx scripts-ts/deploy_all_fixed.ts
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const N8N_API_URL = process.env.N8N_API_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');

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

// Node version mappings for n8n v2.10.2 compatibility
const NODE_VERSION_UPDATES: Record<string, number> = {
    'n8n-nodes-base.if': 2.3,
    'n8n-nodes-base.switch': 3.4,
    'n8n-nodes-base.code': 2,
    'n8n-nodes-base.googleCalendar': 1.3,
    'n8n-nodes-base.telegram': 1.2,
    'n8n-nodes-base.executeWorkflowTrigger': 1.1,
    'n8n-nodes-base.executeWorkflow': 1.3,
    'n8n-nodes-base.webhook': 2.1,
    'n8n-nodes-base.manualTrigger': 1,
    'n8n-nodes-base.scheduleTrigger': 1.3,
    'n8n-nodes-base.httpRequest': 4.4,
    'n8n-nodes-base.set': 3.4,
    'n8n-nodes-base.postgres': 2.6,
    'n8n-nodes-base.errorTrigger': 1,
};

let api: AxiosInstance;

function initApi() {
    if (!N8N_API_KEY) {
        log.error('N8N_API_KEY not found in environment');
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

function fixNodeVersions(workflow: any): { updates: number } {
    const updates = { updates: 0 };

    for (const node of workflow.nodes || []) {
        const nodeType = node.type;
        const currentVersion = node.typeVersion;
        const targetVersion = NODE_VERSION_UPDATES[nodeType];

        if (targetVersion !== undefined && currentVersion < targetVersion) {
            node.typeVersion = targetVersion;
            updates.updates++;
        }
    }

    return updates;
}

async function uploadWorkflow(workflowData: any): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const { active, ...dataToUpload } = workflowData;
        const response = await api.post('/api/v1/workflows', dataToUpload);
        return { success: true, id: response.data.id };
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message;
        return { success: false, error: errorMessage };
    }
}

async function activateWorkflow(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        await api.post(`/api/v1/workflows/${id}/activate`);
        return { success: true };
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message;
        return { success: false, error: errorMessage };
    }
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('DEPLOY ALL WORKFLOWS - Fixed Node Versions for n8n v2.10.2');
    console.log('='.repeat(70) + '\n');

    initApi();

    // Load all workflows
    log.info(`Loading workflows from ${WORKFLOWS_DIR}...`);
    
    if (!fs.existsSync(WORKFLOWS_DIR)) {
        log.error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(WORKFLOWS_DIR)
        .filter(f => f.endsWith('.json') && !f.includes('_FIXED') && !f.includes('_MINIMAL') && !f.includes('_WITH_IF'));

    log.success(`Found ${files.length} workflow files\n`);

    const results: Array<{ name: string; success: boolean; error?: string; id?: string; updates: number }> = [];

    for (const file of files) {
        const filePath = path.join(WORKFLOWS_DIR, file);
        const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        console.log('-'.repeat(70));
        log.info(`Processing: ${workflow.name}`);

        // Fix node versions
        const { updates } = fixNodeVersions(workflow);

        // Upload
        const uploadResult = await uploadWorkflow(workflow);

        if (!uploadResult.success) {
            log.error(`Upload failed: ${uploadResult.error}`);
            results.push({ name: workflow.name, success: false, error: uploadResult.error, updates });
            continue;
        }

        log.success(`Uploaded: ${workflow.name} (ID: ${uploadResult.id})`);

        // Activate
        const activationResult = await activateWorkflow(uploadResult.id!);

        if (activationResult.success) {
            log.success(`✓ Activated: ${workflow.name}`);
            results.push({ name: workflow.name, success: true, id: uploadResult.id, updates });
        } else {
            log.error(`Activation failed: ${activationResult.error}`);
            results.push({ name: workflow.name, success: false, error: activationResult.error, updates });
        }

        console.log('');
    }

    // Summary
    console.log('='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70));
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalUpdates = results.reduce((sum, r) => sum + r.updates, 0);

    console.log(`\nTotal workflows: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total node version updates: ${totalUpdates}`);

    if (failCount > 0) {
        console.log('\nFailed workflows:');
        for (const r of results) {
            if (!r.success) {
                console.log(`  • ${r.name}: ${r.error}`);
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('Deployment complete!');
    console.log('='.repeat(70) + '\n');
}

main().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
