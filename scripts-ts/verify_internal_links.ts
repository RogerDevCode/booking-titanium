#!/usr/bin/env node
/**
 * =============================================================================
 * Verify Internal Workflow Links
 * =============================================================================
 * Purpose: Verify that all sub-workflow references point to valid, published workflows
 * Usage: npx tsx scripts-ts/verify_internal_links.ts
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
    fail: (msg: string) => console.log(`${COLORS.red}❌ ${msg}${COLORS.reset}`),
    pass: (msg: string) => console.log(`${COLORS.green}✓ ${msg}${COLORS.reset}`),
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

interface WorkflowLink {
    workflowName: string;
    nodeName: string;
    nodeType: string;
    referencedWorkflowId: string;
    referencedWorkflowName?: string;
    isValid: boolean;
    isPublished?: boolean;
    issue?: string;
}

function extractWorkflowReferences(workflow: any): WorkflowLink[] {
    const links: WorkflowLink[] = [];
    const workflowName = workflow.name || 'Unknown';

    for (const node of workflow.nodes || []) {
        const nodeType = node.type;
        const nodeName = node.name;

        // Check for executeWorkflow nodes
        if (nodeType === 'n8n-nodes-base.executeWorkflow') {
            const workflowId = node.parameters?.workflowId?.value || node.parameters?.workflowId;
            if (workflowId) {
                links.push({
                    workflowName,
                    nodeName,
                    nodeType,
                    referencedWorkflowId: workflowId,
                    isValid: false,
                });
            }
        }

        // Check for Execute Workflow nodes that reference by ID in other ways
        if (nodeType === 'n8n-nodes-base.executeWorkflow' || nodeType.includes('execute')) {
            const params = node.parameters || {};
            for (const [key, value] of Object.entries(params)) {
                if (typeof value === 'string' && /^[a-zA-Z0-9]{16,}$/.test(value)) {
                    // Looks like a workflow ID
                    const existingLink = links.find(l => 
                        l.workflowName === workflowName && 
                        l.nodeName === nodeName && 
                        l.referencedWorkflowId === value
                    );
                    if (!existingLink) {
                        links.push({
                            workflowName,
                            nodeName,
                            nodeType,
                            referencedWorkflowId: value,
                            isValid: false,
                        });
                    }
                }
            }
        }
    }

    return links;
}

async function getServerWorkflows() {
    try {
        const response = await api.get('/api/v1/workflows');
        const workflows = response.data.data || [];
        
        // Build maps
        const idToWorkflow = new Map<string, any>();
        const nameToWorkflows = new Map<string, any[]>();

        for (const wf of workflows) {
            idToWorkflow.set(wf.id, wf);
            
            if (!nameToWorkflows.has(wf.name)) {
                nameToWorkflows.set(wf.name, []);
            }
            nameToWorkflows.get(wf.name)!.push(wf);
        }

        return { idToWorkflow, nameToWorkflows, workflows };
    } catch (error: any) {
        log.error(`Failed to fetch workflows: ${error.message}`);
        return { idToWorkflow: new Map(), nameToWorkflows: new Map(), workflows: [] };
    }
}

async function verifyLinks() {
    console.log('\n' + '='.repeat(70));
    console.log('VERIFY INTERNAL WORKFLOW LINKS');
    console.log('='.repeat(70) + '\n');

    initApi();

    // Load local workflows
    log.info('Loading local workflows...');
    const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
    const localWorkflows: any[] = [];

    for (const file of files) {
        const filePath = path.join(WORKFLOWS_DIR, file);
        const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        localWorkflows.push(workflow);
    }

    log.success(`Loaded ${localWorkflows.length} workflows\n`);

    // Get server workflows
    log.info('Fetching server workflows...');
    const { idToWorkflow, nameToWorkflows, workflows: serverWorkflows } = await getServerWorkflows();
    log.success(`Found ${serverWorkflows.length} workflows on server\n`);

    // Extract all links
    console.log('-'.repeat(70));
    console.log('EXTRACTING WORKFLOW REFERENCES:');
    console.log('-'.repeat(70) + '\n');

    const allLinks: WorkflowLink[] = [];

    for (const workflow of localWorkflows) {
        const links = extractWorkflowReferences(workflow);
        allLinks.push(...links);
    }

    if (allLinks.length === 0) {
        log.info('No sub-workflow references found.');
        console.log('\nThis is normal if your workflows do not use Execute Workflow nodes.\n');
        return;
    }

    log.info(`Found ${allLinks.length} workflow reference(s)\n`);

    // Verify each link
    console.log('-'.repeat(70));
    console.log('VERIFICATION RESULTS:');
    console.log('-'.repeat(70) + '\n');

    let validCount = 0;
    let invalidCount = 0;
    let unpublishedCount = 0;

    for (const link of allLinks) {
        // Check if referenced workflow exists on server
        const serverWorkflow = idToWorkflow.get(link.referencedWorkflowId);

        if (!serverWorkflow) {
            link.isValid = false;
            link.issue = 'Workflow not found on server';
            invalidCount++;
            
            console.log(`${COLORS.red}❌ ${link.workflowName}${COLORS.reset}`);
            console.log(`   Node: ${link.nodeName} (${link.nodeType})`);
            console.log(`   References: ${link.referencedWorkflowId}`);
            console.log(`   ${COLORS.red}Issue: ${link.issue}${COLORS.reset}\n`);
        } else {
            link.referencedWorkflowName = serverWorkflow.name;
            
            if (!serverWorkflow.active) {
                link.isValid = true;
                link.isPublished = false;
                link.issue = 'Workflow exists but is NOT PUBLISHED';
                unpublishedCount++;
                
                console.log(`${COLORS.yellow}⚠️  ${link.workflowName}${COLORS.reset}`);
                console.log(`   Node: ${link.nodeName} (${link.nodeType})`);
                console.log(`   References: ${link.referencedWorkflowId} (${serverWorkflow.name})`);
                console.log(`   ${COLORS.yellow}Warning: ${link.issue}${COLORS.reset}\n`);
            } else {
                link.isValid = true;
                link.isPublished = true;
                validCount++;
                
                console.log(`${COLORS.green}✓ ${link.workflowName}${COLORS.reset}`);
                console.log(`   Node: ${link.nodeName} (${link.nodeType})`);
                console.log(`   References: ${link.referencedWorkflowId} (${serverWorkflow.name}) - ${COLORS.green}OK${COLORS.reset}\n`);
            }
        }
    }

    // Summary
    console.log('='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70));
    console.log(`Total references: ${allLinks.length}`);
    console.log(`${COLORS.green}✓ Valid & Published: ${validCount}${COLORS.reset}`);
    console.log(`${COLORS.yellow}⚠️  Valid but Unpublished: ${unpublishedCount}${COLORS.reset}`);
    console.log(`${COLORS.red}❌ Invalid (not found): ${invalidCount}${COLORS.reset}`);

    if (invalidCount > 0 || unpublishedCount > 0) {
        console.log('\n' + '-'.repeat(70));
        console.log('RECOMMENDED ACTIONS:');
        console.log('-'.repeat(70));
        
        if (invalidCount > 0) {
            console.log('\n1. Update workflow IDs to match server:');
            console.log('   npx tsx scripts-ts/update_references.ts\n');
        }
        
        if (unpublishedCount > 0) {
            console.log('2. Publish referenced workflows:');
            console.log('   npx tsx scripts-ts/n8n_push_v2.ts --name <WORKFLOW_NAME> --file workflows/<FILE>.json --activate\n');
        }
    } else {
        console.log('\n' + '='.repeat(70));
        log.success('All workflow links are valid and published!');
        console.log('='.repeat(70) + '\n');
    }
}

verifyLinks().catch(error => {
    log.error(`Script failed: ${error.message}`);
    console.error(error);
    process.exit(1);
});
