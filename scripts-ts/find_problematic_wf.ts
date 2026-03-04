#!/usr/bin/env node
/**
 * =============================================================================
 * Find Problematic Workflow Script
 * =============================================================================
 * Purpose: Upload workflows one by one to identify which one causes 
 *          "propertyValues[itemName] is not iterable" error
 * Usage: npx tsx scripts-ts/find_problematic_wf.ts
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

async function uploadWorkflow(workflow: WorkflowInfo): Promise<{ success: boolean; error?: string; workflowId?: string }> {
    try {
        log.deploy(`Uploading: ${workflow.name}...`);

        // Remove active field from workflow data (read-only in some operations)
        const { active, ...workflowData } = workflow.data;

        const response = await api.post('/api/v1/workflows', workflowData);
        
        const workflowId = response.data.id;
        log.success(`✓ Uploaded: ${workflow.name} (ID: ${workflowId})`);
        
        return { success: true, workflowId };
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message;
        const statusCode = error.response?.status;
        
        // Check for the specific error we're looking for
        if (errorMessage.includes('propertyValues') && errorMessage.includes('iterable')) {
            log.fail(`✗ CRITICAL ERROR: ${workflow.name}`);
            log.error(`Error message: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
        
        // Other errors - might be duplicate name, etc.
        log.warning(`✗ Error uploading ${workflow.name}: ${errorMessage} (Status: ${statusCode})`);
        return { success: false, error: errorMessage };
    }
}

async function deleteWorkflow(workflowId: string): Promise<boolean> {
    try {
        await api.delete(`/api/v1/workflows/${workflowId}`);
        return true;
    } catch (error: any) {
        log.warning(`Failed to delete workflow ${workflowId}: ${error.message}`);
        return false;
    }
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('FIND PROBLEMATIC WORKFLOW - "propertyValues[itemName] is not iterable"');
    console.log('='.repeat(70) + '\n');

    initApi();
    const workflows = loadWorkflows();

    console.log('\n' + '-'.repeat(70));
    console.log('Starting upload test...\n');

    const results: Array<{ name: string; success: boolean; error?: string; workflowId?: string }> = [];
    const uploadedIds: string[] = [];

    for (const workflow of workflows) {
        const result = await uploadWorkflow(workflow);
        results.push({ name: workflow.name, ...result });

        if (result.success && result.workflowId) {
            uploadedIds.push(result.workflowId);
        }

        // If we found the problematic workflow, stop here
        if (!result.success && result.error?.includes('propertyValues') && result.error?.includes('iterable')) {
            console.log('\n' + '='.repeat(70));
            log.fail('PROBLEMATIC WORKFLOW FOUND!');
            console.log('='.repeat(70));
            console.log(`\nWorkflow: ${workflow.name}`);
            console.log(`File: ${workflow.path}`);
            console.log(`Error: ${result.error}\n`);
            
            // Show which nodes might be problematic
            analyzeWorkflowForProblematicNodes(workflow.data);
            
            console.log('\n' + '-'.repeat(70));
            console.log('Cleaning up uploaded workflows...\n');
            
            // Clean up uploaded workflows
            for (const id of uploadedIds) {
                log.info(`Deleting workflow ${id}...`);
                await deleteWorkflow(id);
            }
            
            process.exit(1);
        }

        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // If we get here, no problematic workflow was found
    console.log('\n' + '='.repeat(70));
    log.success('NO PROBLEMATIC WORKFLOW FOUND!');
    console.log('='.repeat(70));
    console.log('\nAll workflows uploaded successfully without the "propertyValues" error.\n');

    // Summary
    console.log('-'.repeat(70));
    console.log('SUMMARY:');
    console.log('-'.repeat(70));
    for (const result of results) {
        const status = result.success ? '✓' : '✗';
        console.log(`${status} ${result.name}`);
    }

    // Clean up
    console.log('\n' + '-'.repeat(70));
    console.log('Cleaning up uploaded workflows...\n');
    
    for (const id of uploadedIds) {
        log.info(`Deleting workflow ${id}...`);
        await deleteWorkflow(id);
    }

    console.log('\nDone!\n');
}

/**
 * Analyze workflow JSON to find nodes with potentially problematic fixedCollection structures
 */
function analyzeWorkflowForProblematicNodes(workflowData: any) {
    console.log('\n' + '-'.repeat(70));
    console.log('ANALYZING WORKFLOW FOR PROBLEMATIC NODES:');
    console.log('-'.repeat(70) + '\n');

    const nodes = workflowData.nodes || [];
    const problematicNodes: Array<{ name: string; type: string; issue: string }> = [];

    for (const node of nodes) {
        const params = node.parameters || {};
        
        // Check for common fixedCollection patterns that cause the error
        const collectionFields = ['assignments', 'conditions', 'filters', 'options', 'properties', 'values'];
        
        for (const field of collectionFields) {
            if (params[field] !== undefined) {
                const value = params[field];
                
                // Check if it should be an array but isn't
                if (typeof value === 'object' && !Array.isArray(value)) {
                    // Check if it has nested structure that should be array
                    if (value[field] !== undefined && !Array.isArray(value[field])) {
                        problematicNodes.push({
                            name: node.name,
                            type: node.type,
                            issue: `Parameter '${field}' has invalid structure (expected array, got object)`
                        });
                    }
                }
                
                // Check for null values where arrays expected
                if (value === null) {
                    problematicNodes.push({
                        name: node.name,
                        type: node.type,
                        issue: `Parameter '${field}' is null (expected array)`
                    });
                }
            }
        }
        
        // Check for specific node types known to cause issues
        const problematicNodeTypes = ['n8n-nodes-base.switch', 'n8n-nodes-base.if', 'n8n-nodes-base.filter', 'n8n-nodes-base.httpRequest'];
        if (problematicNodeTypes.includes(node.type)) {
            // Check if parameters look incomplete
            if (!params.options && !params.conditions && !params.filters) {
                problematicNodes.push({
                    name: node.name,
                    type: node.type,
                    issue: `Node type '${node.type}' may have incomplete parameters`
                });
            }
        }
    }

    if (problematicNodes.length > 0) {
        console.log(`Found ${problematicNodes.length} potentially problematic node(s):\n`);
        for (const node of problematicNodes) {
            console.log(`  • ${node.name} (${node.type})`);
            console.log(`    Issue: ${node.issue}\n`);
        }
    } else {
        console.log('No obvious problematic nodes detected.\n');
    }

    // Show node type summary
    console.log('-'.repeat(70));
    console.log('NODE TYPE SUMMARY:');
    console.log('-'.repeat(70));
    
    const nodeTypeCount: Record<string, number> = {};
    for (const node of nodes) {
        nodeTypeCount[node.type] = (nodeTypeCount[node.type] || 0) + 1;
    }
    
    for (const [type, count] of Object.entries(nodeTypeCount)) {
        console.log(`  ${type}: ${count}`);
    }
    console.log('');
}

// Run main function
main().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
