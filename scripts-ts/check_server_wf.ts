#!/usr/bin/env node
/**
 * =============================================================================
 * Check Server Workflows Script
 * =============================================================================
 * Purpose: Check existing workflows on n8n server for potential issues
 * Usage: npx tsx scripts-ts/check_server_wf.ts
 * =============================================================================
 */

import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Configuration
const N8N_API_URL = process.env.N8N_API_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;

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

async function getAllWorkflows() {
    try {
        const response = await api.get('/api/v1/workflows');
        return response.data.data || [];
    } catch (error: any) {
        log.error(`Failed to fetch workflows: ${error.message}`);
        return [];
    }
}

async function getWorkflowDetails(id: string) {
    try {
        const response = await api.get(`/api/v1/workflows/${id}`);
        return response.data;
    } catch (error: any) {
        log.error(`Failed to fetch workflow ${id}: ${error.message}`);
        return null;
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

async function deactivateWorkflow(id: string): Promise<boolean> {
    try {
        await api.post(`/api/v1/workflows/${id}/deactivate`);
        return true;
    } catch (error: any) {
        return false;
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

function analyzeWorkflowNodes(workflow: any): Array<{ nodeName: string; nodeType: string; issue: string }> {
    const issues: Array<{ nodeName: string; nodeType: string; issue: string }> = [];
    const nodes = workflow.nodes || [];

    for (const node of nodes) {
        const params = node.parameters || {};
        
        // Check for fixedCollection patterns
        const collectionFields = ['assignments', 'conditions', 'filters', 'options', 'properties', 'values'];
        
        for (const field of collectionFields) {
            if (params[field] !== undefined) {
                const value = params[field];
                
                // Check if it's an object with nested field that should be array
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    if (value[field] !== undefined && !Array.isArray(value[field])) {
                        issues.push({
                            nodeName: node.name,
                            nodeType: node.type,
                            issue: `Parameter '${field}' has invalid structure (expected array)`
                        });
                    }
                }
                
                // Check for null values
                if (value === null) {
                    issues.push({
                        nodeName: node.name,
                        nodeType: node.type,
                        issue: `Parameter '${field}' is null (expected array)`
                    });
                }
            }
        }
    }

    return issues;
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('CHECK SERVER WORKFLOWS - Activation Test');
    console.log('='.repeat(70) + '\n');

    initApi();

    log.info('Fetching all workflows from server...');
    const workflows = await getAllWorkflows();
    
    log.success(`Found ${workflows.length} workflows on server\n`);

    if (workflows.length === 0) {
        log.info('No workflows found on server. The issue may be transient.');
        return;
    }

    console.log('-'.repeat(70));
    console.log('Testing activation for each workflow...\n');

    for (const wf of workflows) {
        console.log(`Testing: ${wf.name} (ID: ${wf.id}, Active: ${wf.active})`);
        
        // First, deactivate if active
        if (wf.active) {
            log.info('Deactivating...');
            await deactivateWorkflow(wf.id);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Try to activate
        log.info('Activating...');
        const result = await activateWorkflow(wf.id);

        if (result.success) {
            log.success('✓ Activation successful\n');
            
            // Deactivate again to leave in original state
            await deactivateWorkflow(wf.id);
        } else {
            log.fail('✗ Activation FAILED!');
            log.error(`Error: ${result.error}\n`);

            // Check if it's the propertyValues error
            if (result.error?.includes('propertyValues') && result.error?.includes('iterable')) {
                console.log('='.repeat(70));
                log.fail('FOUND THE PROBLEMATIC WORKFLOW!');
                console.log('='.repeat(70));
                console.log(`\nName: ${wf.name}`);
                console.log(`ID: ${wf.id}\n`);

                // Get full details and analyze
                const details = await getWorkflowDetails(wf.id);
                if (details) {
                    console.log('-'.repeat(70));
                    console.log('PROBLEMATIC NODES:');
                    console.log('-'.repeat(70));
                    
                    const issues = analyzeWorkflowNodes(details);
                    if (issues.length > 0) {
                        for (const issue of issues) {
                            console.log(`\n  • ${issue.nodeName} (${issue.nodeType})`);
                            console.log(`    Issue: ${issue.issue}`);
                        }
                    } else {
                        console.log('No obvious node structure issues detected.');
                        console.log('The problem may be in node internal state or version mismatch.');
                    }
                }

                console.log('\n' + '-'.repeat(70));
                console.log('RECOMMENDATION:');
                console.log('-'.repeat(70));
                console.log('1. Delete this workflow from the server');
                console.log('2. Re-upload from local JSON file');
                console.log('3. Or manually edit the problematic node parameters\n');

                // Ask if user wants to delete
                console.log(`${COLORS.yellow}Would you like to delete this problematic workflow? (y/n): ${COLORS.reset}`);
                
                // For now, just show the info - user can decide
                console.log('\nSkipping deletion for now. Continuing with other workflows...\n');
            }
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('='.repeat(70));
    log.info('Server workflow check complete!\n');
}

main().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
