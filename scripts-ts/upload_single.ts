#!/usr/bin/env node
/**
 * =============================================================================
 * Upload Single Workflow Test
 * =============================================================================
 * Purpose: Upload a single workflow and test activation to isolate the issue
 * Usage: npx tsx scripts-ts/upload_single.ts <workflow-file.json>
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

async function deleteWorkflow(id: string): Promise<boolean> {
    try {
        await api.delete(`/api/v1/workflows/${id}`);
        return true;
    } catch (error: any) {
        return false;
    }
}

async function main() {
    const workflowFile = process.argv[2];

    if (!workflowFile) {
        console.log('Usage: npx tsx scripts-ts/upload_single.ts <workflow-file.json>');
        console.log('\nExamples:');
        console.log('  GCAL_Create_Event.json (from workflows/ folder)');
        console.log('  /absolute/path/to/workflow.json\n');
        process.exit(1);
    }

    initApi();

    // Handle both absolute and relative paths correctly
    const filePath = path.isAbsolute(workflowFile) 
        ? workflowFile 
        : path.resolve(process.cwd(), workflowFile);
    
    if (!fs.existsSync(filePath)) {
        log.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    console.log('\n' + '='.repeat(70));
    console.log(`TEST: ${workflow.name}`);
    console.log('='.repeat(70) + '\n');

    log.info(`Loading: ${workflow.name}`);
    log.info(`Nodes: ${workflow.nodes?.length || 0}`);
    
    // Show node types and versions
    console.log('\nNode types:');
    for (const node of workflow.nodes || []) {
        console.log(`  ${node.name}: ${node.type} v${node.typeVersion}`);
    }
    console.log('');

    // Upload
    log.info('Uploading to server...');
    const uploadResult = await uploadWorkflow(workflow);

    if (!uploadResult.success) {
        log.error(`Upload failed: ${uploadResult.error}`);
        process.exit(1);
    }

    log.success(`Uploaded with ID: ${uploadResult.id}\n`);

    // Activate
    log.info('Activating workflow...');
    const activationResult = await activateWorkflow(uploadResult.id!);

    if (activationResult.success) {
        log.success('✓ Activation successful!\n');
        log.info('Workflow is now active. You can test it from the UI or via webhook.');
    } else {
        log.error(`✗ Activation failed: ${activationResult.error}`);
        
        if (activationResult.error?.includes('propertyValues') && activationResult.error?.includes('iterable')) {
            console.log('\n' + '='.repeat(70));
            log.error('propertyValues[itemName] is not iterable');
            console.log('='.repeat(70));
            console.log('\nThis error indicates:');
            console.log('  1. Node parameter type mismatch (array vs object)');
            console.log('  2. Corrupted node internal state');
            console.log('  3. Node type version incompatibility\n');
            console.log('The workflow JSON may look correct, but n8n\'s internal');
            console.log('validation during activation is failing.\n');
        }
        
        // Delete the failed workflow
        log.info('Cleaning up failed workflow...');
        await deleteWorkflow(uploadResult.id!);
        process.exit(1);
    }
}

main().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
