#!/usr/bin/env node
/**
 * =============================================================================
 * N8N Workflow Deployment Script
 * =============================================================================
 * Purpose: Deploy all workflows to N8N server via API
 * Usage: npx tsx deploy_workflows.ts [--activate] [--dry-run]
 * 
 * WATCHDOG: This script has a 3-minute timeout (180 seconds)
 * If execution exceeds this limit, the process will be killed with exit code 3
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Configuration
const N8N_API_URL = process.env.N8N_API_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');

// Colors
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
    deploy: (msg: string) => console.log(`${COLORS.cyan}[DEPLOY]${COLORS.reset} ${msg}`),
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
    });

    api.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response?.status === 401) {
                log.error('Authentication failed. Check N8N_API_KEY');
            }
            throw error;
        }
    );
}

// Workflow Management
interface WorkflowInfo {
    name: string;
    path: string;
    data: any;
}

function loadWorkflows(): WorkflowInfo[] {
    log.info(`Loading workflows from ${WORKFLOWS_DIR}...`);
    
    if (!fs.existsSync(WORKFLOWS_DIR)) {
        log.error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(WORKFLOWS_DIR)
        .filter(f => f.endsWith('.json'));

    const workflows: WorkflowInfo[] = [];
    
    for (const file of files) {
        const filePath = path.join(WORKFLOWS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        workflows.push({
            name: data.name || file.replace('.json', ''),
            path: filePath,
            data,
        });
    }

    log.success(`Loaded ${workflows.length} workflows`);
    return workflows;
}

async function getExistingWorkflows(): Promise<Map<string, { id: string; name: string; active: boolean }>> {
    log.info('Fetching existing workflows from N8N...');
    
    try {
        const response = await api.get('/api/v1/workflows');
        const existing = new Map<string, { id: string; name: string; active: boolean }>();
        
        for (const wf of response.data.data || []) {
            existing.set(wf.name, {
                id: wf.id,
                name: wf.name,
                active: wf.active,
            });
        }
        
        log.success(`Found ${existing.size} existing workflows`);
        return existing;
    } catch (error: any) {
        log.error(`Failed to fetch workflows: ${error.message}`);
        return new Map();
    }
}

async function deployWorkflow(workflow: WorkflowInfo, existing: Map<string, any>, activate: boolean): Promise<boolean> {
    const existingWf = existing.get(workflow.name);

    try {
        if (existingWf) {
            // Update existing - don't include 'active' field (read-only in update)
            log.deploy(`Updating: ${workflow.name} (${existingWf.id})...`);

            // Remove active field from workflow data for update
            const { active, ...workflowData } = workflow.data;
            
            await api.put(`/api/v1/workflows/${existingWf.id}`, workflowData);

            log.success(`✓ Updated: ${workflow.name}`);
            
            // Activate separately if needed
            if (activate) {
                await activateWorkflow(existingWf.id);
            }
        } else {
            // Create new
            log.deploy(`Creating: ${workflow.name}...`);

            const response = await api.post('/api/v1/workflows', {
                ...workflow.data,
                active: activate,
            });

            log.success(`✓ Created: ${workflow.name} (ID: ${response.data.id})`);
        }

        return true;
    } catch (error: any) {
        log.error(`✗ Failed: ${workflow.name} - ${error.response?.data?.message || error.message}`);
        return false;
    }
}

async function activateWorkflow(workflowId: string): Promise<boolean> {
    try {
        await api.patch(`/api/v1/workflows/${workflowId}`, {
            active: true,
        });
        return true;
    } catch (error: any) {
        log.error(`Failed to activate: ${error.message}`);
        return false;
    }
}

// Main
async function main() {
    console.log('==============================================');
    console.log('  N8N Workflow Deployment');
    console.log(`  ${new Date().toISOString()}`);
    console.log('==============================================\n');

    const args = process.argv.slice(2);
    const activate = args.includes('--activate');
    const dryRun = args.includes('--dry-run');

    if (!N8N_API_KEY) {
        log.error('N8N_API_KEY is required. Set it in scripts-ts/.env');
        process.exit(1);
    }

    log.info(`N8N API URL: ${N8N_API_URL}`);
    log.info(`Activate workflows: ${activate ? 'YES' : 'NO'}`);
    log.info(`Dry run: ${dryRun ? 'YES' : 'NO'}`);
    console.log('');

    initApi();
    const workflows = loadWorkflows();
    const existing = await getExistingWorkflows();

    if (dryRun) {
        log.warning('DRY RUN - No changes will be made\n');
        for (const wf of workflows) {
            const exists = existing.has(wf.name);
            console.log(`  ${exists ? 'UPDATE' : 'CREATE'}: ${wf.name}`);
        }
        return;
    }

    console.log('');
    let success = 0;
    let failed = 0;

    for (const workflow of workflows) {
        const result = await deployWorkflow(workflow, existing, activate);
        if (result) success++;
        else failed++;
    }

    console.log('');
    console.log('==============================================');
    log.success(`Deployment complete: ${success} succeeded, ${failed} failed`);
    console.log('==============================================');

    // Cancel watchdog on successful completion
    watchdog.cancel();
    
    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((error) => {
    watchdog.cancel();
    log.error(error.message);
    process.exit(1);
});
