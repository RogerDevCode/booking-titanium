#!/usr/bin/env node
/**
 * =============================================================================
 * Re-deploy Failed Workflows
 * =============================================================================
 * Purpose: Delete and re-upload workflows that failed activation due to 
 *          old sub-workflow references
 * 
 * Failed workflows:
 *   - BB_90_Reminder_Scheduler
 *   - DB_Reschedule_Booking
 *   - NN_01_Booking_Gateway_V4_Final
 *   - NN_01_Test_Simple
 *   - NN_05_Reminder_Cron
 * 
 * Usage: npx tsx scripts-ts/redeploy_failed.ts
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

const FAILED_WORKFLOWS = [
    'BB_90_Reminder_Scheduler',
    'DB_Reschedule_Booking',
    'NN_01_Booking_Gateway_V4_Final',
    'NN_01_Test_Simple',
    'NN_05_Reminder_Cron',
];

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

async function getAllWorkflows() {
    try {
        const response = await api.get('/api/v1/workflows');
        return response.data.data || [];
    } catch (error: any) {
        return [];
    }
}

async function deleteWorkflow(id: string, name: string): Promise<boolean> {
    try {
        await api.delete(`/api/v1/workflows/${id}`);
        return true;
    } catch (error: any) {
        return false;
    }
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
    console.log('RE-DEPLOY FAILED WORKFLOWS - With Updated References');
    console.log('='.repeat(70) + '\n');

    initApi();

    // Get existing workflows
    log.info('Fetching existing workflows...');
    const existing = await getAllWorkflows();
    const existingMap = new Map(existing.map(wf => [wf.name, wf.id]));

    const results: Array<{ name: string; success: boolean; error?: string; id?: string }> = [];

    for (const workflowName of FAILED_WORKFLOWS) {
        const filePath = path.join(WORKFLOWS_DIR, `${workflowName}.json`);
        
        if (!fs.existsSync(filePath)) {
            log.error(`File not found: ${filePath}`);
            continue;
        }

        console.log('-'.repeat(70));
        log.info(`Processing: ${workflowName}`);

        const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Delete existing if present
        const existingId = existingMap.get(workflowName);
        if (existingId) {
            log.info(`Deleting existing (ID: ${existingId})...`);
            await deleteWorkflow(existingId, workflowName);
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Upload
        const uploadResult = await uploadWorkflow(workflow);
        if (!uploadResult.success) {
            log.error(`Upload failed: ${uploadResult.error}`);
            results.push({ name: workflowName, success: false, error: uploadResult.error });
            continue;
        }

        log.success(`Uploaded: ${workflowName} (ID: ${uploadResult.id})`);

        // Activate
        const activationResult = await activateWorkflow(uploadResult.id!);
        if (activationResult.success) {
            log.success(`✓ Activated: ${workflowName}`);
            results.push({ name: workflowName, success: true, id: uploadResult.id });
        } else {
            log.error(`Activation failed: ${activationResult.error}`);
            results.push({ name: workflowName, success: false, error: activationResult.error });
        }

        console.log('');
    }

    // Summary
    console.log('='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70));
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\nTotal: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failCount}`);

    if (failCount > 0) {
        console.log('\nFailed workflows:');
        for (const r of results) {
            if (!r.success) {
                console.log(`  • ${r.name}: ${r.error}`);
            }
        }
    } else {
        log.success('All workflows deployed and activated successfully!');
    }

    console.log('\n' + '='.repeat(70));
}

main().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
