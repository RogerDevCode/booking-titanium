#!/usr/bin/env node
/**
 * =============================================================================
 * Fix Problematic Workflows Script
 * =============================================================================
 * Purpose: Delete and re-upload workflows that have "propertyValues[itemName] 
 *          is not iterable" error on activation
 * 
 * Problematic workflows identified:
 *   - GCAL_Create_Event (ID: bc8zMLI9O5ytO7a2)
 *   - NN_04_Telegram_Sender (ID: 4afRuMkIvgEh7gXt)
 * 
 * Usage: npx tsx scripts-ts/fix_problematic_wf.ts
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Configuration
const N8N_API_URL = process.env.N8N_API_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');

// Problematic workflow IDs on server
const PROBLEMATIC_WORKFLOWS = [
    { name: 'GCAL_Create_Event', serverId: 'bc8zMLI9O5ytO7a2', file: 'GCAL_Create_Event.json' },
    { name: 'NN_04_Telegram_Sender', serverId: '4afRuMkIvgEh7gXt', file: 'NN_04_Telegram_Sender.json' },
];

// Colors
const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

const log = {
    info: (msg: string) => console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${msg}`),
    success: (msg: string) => console.log(`${COLORS.green}[SUCCESS]${COLORS.reset} ${msg}`),
    warning: (msg: string) => console.log(`${COLORS.yellow}[WARNING]${COLORS.reset} ${msg}`),
    error: (msg: string) => console.log(`${COLORS.red}[ERROR]${COLORS.reset} ${msg}`),
    deploy: (msg: string) => console.log(`${COLORS.cyan}[DEPLOY]${COLORS.reset} ${msg}`),
    fail: (msg: string) => console.log(`${COLORS.magenta}[FAIL]${COLORS.reset} ${msg}`),
};

// N8N API Client
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

async function deleteWorkflow(id: string, name: string): Promise<boolean> {
    try {
        log.info(`Deleting workflow ${name} (ID: ${id})...`);
        await api.delete(`/api/v1/workflows/${id}`);
        log.success(`✓ Deleted: ${name}`);
        return true;
    } catch (error: any) {
        log.error(`Failed to delete ${name}: ${error.message}`);
        return false;
    }
}

async function uploadWorkflow(workflowData: any, name: string): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        log.deploy(`Uploading: ${name}...`);

        // Remove active field from workflow data
        const { active, ...dataToUpload } = workflowData;

        const response = await api.post('/api/v1/workflows', dataToUpload);
        
        const workflowId = response.data.id;
        log.success(`✓ Uploaded: ${name} (ID: ${workflowId})`);
        
        return { success: true, id: workflowId };
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message;
        log.error(`Failed to upload ${name}: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}

async function activateWorkflow(id: string, name: string): Promise<{ success: boolean; error?: string }> {
    try {
        log.info(`Activating: ${name}...`);
        await api.post(`/api/v1/workflows/${id}/activate`);
        log.success(`✓ Activated: ${name}`);
        return { success: true };
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message;
        log.error(`Failed to activate ${name}: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
}

function loadWorkflowFile(filename: string): any {
    const filePath = path.join(WORKFLOWS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`Workflow file not found: ${filePath}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
}

async function fixWorkflow(problematic: typeof PROBLEMATIC_WORKFLOWS[0]): Promise<{ success: boolean; newId?: string }> {
    console.log('\n' + '-'.repeat(70));
    log.deploy(`Fixing: ${problematic.name}`);
    console.log('-'.repeat(70));

    // Step 1: Delete the problematic workflow from server
    const deleted = await deleteWorkflow(problematic.serverId, problematic.name);
    
    if (!deleted) {
        log.warning(`Could not delete ${problematic.name}, but continuing anyway...`);
    }

    // Step 2: Load local file
    log.info(`Loading local file: ${problematic.file}`);
    let workflowData: any;
    
    try {
        workflowData = loadWorkflowFile(problematic.file);
        log.success(`✓ Loaded: ${problematic.file}`);
    } catch (error: any) {
        log.error(`Failed to load local file: ${error.message}`);
        return { success: false };
    }

    // Step 3: Upload fresh copy
    const uploadResult = await uploadWorkflow(workflowData, problematic.name);
    
    if (!uploadResult.success) {
        log.fail(`✗ Upload failed for ${problematic.name}`);
        return { success: false };
    }

    // Step 4: Activate to verify fix
    if (uploadResult.id) {
        const activationResult = await activateWorkflow(uploadResult.id, problematic.name);
        
        if (!activationResult.success) {
            log.fail(`✗ Activation failed for ${problematic.name}`);
            log.error(`Error: ${activationResult.error}`);
            
            if (activationResult.error?.includes('propertyValues') && activationResult.error?.includes('iterable')) {
                log.fail('The propertyValues error persists! The local file may also be corrupted.');
                return { success: false };
            }
        }
    }

    log.success(`✓ Fixed: ${problematic.name}\n`);
    return { success: true, newId: uploadResult.id };
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('FIX PROBLEMATIC WORKFLOWS');
    console.log('Target: Workflows with "propertyValues[itemName] is not iterable" error');
    console.log('='.repeat(70) + '\n');

    initApi();

    console.log('Workflows to fix:');
    for (const wf of PROBLEMATIC_WORKFLOWS) {
        console.log(`  • ${wf.name} (Server ID: ${wf.serverId})`);
    }
    console.log('');

    const results: Array<{ name: string; success: boolean; newId?: string }> = [];

    for (const wf of PROBLEMATIC_WORKFLOWS) {
        const result = await fixWorkflow(wf);
        results.push({ name: wf.name, ...result });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between operations
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70) + '\n');

    for (const result of results) {
        const status = result.success ? '✓' : '✗';
        const idInfo = result.newId ? `(New ID: ${result.newId})` : '';
        console.log(`${status} ${result.name} ${idInfo}`);
    }

    const allSuccess = results.every(r => r.success);
    
    console.log('\n' + '='.repeat(70));
    if (allSuccess) {
        log.success('All problematic workflows have been fixed!');
    } else {
        log.fail('Some workflows could not be fixed. Manual intervention may be required.');
    }
    console.log('='.repeat(70) + '\n');

    // Update workflow_activation_order.json if needed
    if (allSuccess) {
        log.info('Note: Remember to update workflow_activation_order.json with new IDs if necessary.');
    }
}

main().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
