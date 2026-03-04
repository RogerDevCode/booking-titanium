#!/usr/bin/env node
/**
 * =============================================================================
 * Compare Local vs Server Workflow
 * =============================================================================
 * Purpose: Fetch workflow from n8n server and compare with local file
 * Usage: npx tsx scripts-ts/compare_workflow.ts NN_03_AI_Agent
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const N8N_API_URL = process.env.N8N_API_URL?.replace(/\/+$/, '') || 'https://n8n.stax.ink';
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_ACCESS_TOKEN = process.env.N8N_ACCESS_TOKEN;

let api: AxiosInstance;

function initApi() {
    const token = N8N_API_KEY || N8N_ACCESS_TOKEN;
    if (!token) {
        console.error('No credentials found (N8N_API_KEY or N8N_ACCESS_TOKEN)');
        process.exit(1);
    }

    api = axios.create({
        baseURL: N8N_API_URL,
        headers: {
            'X-N8N-API-KEY': token,
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
        console.error(`Failed to fetch workflow: ${error.response?.status} ${error.message}`);
        if (error.response?.data) {
            console.error('Response:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

function normalizeWorkflow(wf: any) {
    // Remove metadata that changes frequently
    const normalized = {
        name: wf.name,
        nodes: wf.nodes?.map((n: any) => ({
            name: n.name,
            type: n.type,
            typeVersion: n.typeVersion,
            parameters: n.parameters,
            position: n.position,
            credentials: n.credentials,
        })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
        connections: wf.connections,
        settings: wf.settings,
    };
    return normalized;
}

function compareNodes(localNodes: any[], serverNodes: any[]) {
    const differences: string[] = [];
    
    const localMap = new Map(localNodes.map((n, i) => [n.name, { ...n, _index: i }]));
    const serverMap = new Map(serverNodes.map((n, i) => [n.name, { ...n, _index: i }]));

    // Check for missing/extra nodes
    for (const [name, local] of localMap) {
        if (!serverMap.has(name)) {
            differences.push(`❌ Node '${name}' exists in LOCAL but NOT in SERVER`);
        }
    }
    for (const [name, server] of serverMap) {
        if (!localMap.has(name)) {
            differences.push(`❌ Node '${name}' exists in SERVER but NOT in LOCAL`);
        }
    }

    // Check for differences in matching nodes
    for (const [name, local] of localMap) {
        const server = serverMap.get(name);
        if (!server) continue;

        // Compare type
        if (local.type !== server.type) {
            differences.push(`⚠️ Node '${name}': type differs`);
            differences.push(`   LOCAL:  ${local.type}`);
            differences.push(`   SERVER: ${server.type}`);
        }

        // Compare typeVersion
        if (local.typeVersion !== server.typeVersion) {
            differences.push(`⚠️ Node '${name}': typeVersion differs`);
            differences.push(`   LOCAL:  ${local.typeVersion}`);
            differences.push(`   SERVER: ${server.typeVersion}`);
        }

        // Compare position
        if (JSON.stringify(local.position) !== JSON.stringify(server.position)) {
            differences.push(`⚠️ Node '${name}': position differs (UI only, not functional)`);
            differences.push(`   LOCAL:  [${local.position}]`);
            differences.push(`   SERVER: [${server.position}]`);
        }

        // Compare parameters
        const localParams = JSON.stringify(local.parameters, Object.keys(local.parameters || {}).sort());
        const serverParams = JSON.stringify(server.parameters, Object.keys(server.parameters || {}).sort());
        if (localParams !== serverParams) {
            differences.push(`⚠️ Node '${name}': parameters DIFFER (CRITICAL)`);
            
            // Show specific parameter differences
            const localP = local.parameters || {};
            const serverP = server.parameters || {};
            const allKeys = new Set([...Object.keys(localP), ...Object.keys(serverP)]);
            
            for (const key of allKeys) {
                const localVal = JSON.stringify(localP[key]);
                const serverVal = JSON.stringify(serverP[key]);
                if (localVal !== serverVal) {
                    differences.push(`   Parameter '${key}':`);
                    differences.push(`     LOCAL:  ${localVal?.substring(0, 200)}`);
                    differences.push(`     SERVER: ${serverVal?.substring(0, 200)}`);
                }
            }
        }

        // Compare credentials
        const localCreds = JSON.stringify(local.credentials);
        const serverCreds = JSON.stringify(server.credentials);
        if (localCreds !== serverCreds) {
            differences.push(`⚠️ Node '${name}': credentials differ (may be expected)`);
            differences.push(`   LOCAL:  ${localCreds}`);
            differences.push(`   SERVER: ${serverCreds}`);
        }
    }

    return differences;
}

function compareConnections(localConn: any, serverConn: any) {
    const differences: string[] = [];
    
    const localStr = JSON.stringify(localConn, Object.keys(localConn || {}).sort());
    const serverStr = JSON.stringify(serverConn, Object.keys(serverConn || {}).sort());
    
    if (localStr !== serverStr) {
        differences.push('⚠️ Connections DIFFER (CRITICAL - affects workflow logic)');
        
        // Show which nodes have different connections
        const localKeys = new Set(Object.keys(localConn || {}));
        const serverKeys = new Set(Object.keys(serverConn || {}));
        const allKeys = new Set([...localKeys, ...serverKeys]);
        
        for (const nodeName of allKeys) {
            const localN = localConn?.[nodeName];
            const serverN = serverConn?.[nodeName];
            
            if (JSON.stringify(localN) !== JSON.stringify(serverN)) {
                differences.push(`\n   Node '${nodeName}':`);
                differences.push(`   LOCAL:  ${JSON.stringify(localN, null, 2).substring(0, 500)}`);
                differences.push(`   SERVER: ${JSON.stringify(serverN, null, 2).substring(0, 500)}`);
            }
        }
    }
    
    return differences;
}

async function main() {
    const workflowName = process.argv[2];

    if (!workflowName) {
        console.log('Usage: npx tsx scripts-ts/compare_workflow.ts <workflow-name>');
        console.log('\nExample: npx tsx scripts-ts/compare_workflow.ts NN_03_AI_Agent\n');
        process.exit(1);
    }

    initApi();

    // Get workflow ID from activation order
    const activationOrderPath = path.join(__dirname, 'workflow_activation_order.json');
    let workflowId: string | null = null;
    
    if (fs.existsSync(activationOrderPath)) {
        const order = JSON.parse(fs.readFileSync(activationOrderPath, 'utf8'));
        const found = order.find((w: any) => w.name === workflowName);
        if (found) {
            workflowId = found.id;
            console.log(`Found workflow ID in activation_order.json: ${workflowId}\n`);
        }
    }

    if (!workflowId) {
        console.error(`Workflow '${workflowName}' not found in workflow_activation_order.json`);
        console.error('Please provide the workflow ID directly or update the activation order file.');
        process.exit(1);
    }

    // Load local workflow
    const localPath = path.join(__dirname, '..', 'workflows', `${workflowName}.json`);
    if (!fs.existsSync(localPath)) {
        console.error(`Local workflow not found: ${localPath}`);
        process.exit(1);
    }
    const localWf = JSON.parse(fs.readFileSync(localPath, 'utf8'));
    console.log(`✅ Loaded local workflow: ${localPath}\n`);

    // Fetch server workflow
    console.log(`Fetching workflow '${workflowId}' from server...\n`);
    const serverWf = await getWorkflow(workflowId);

    if (!serverWf) {
        console.error('\n❌ Failed to fetch workflow from server');
        console.error('Check credentials (N8N_ACCESS_TOKEN or N8N_API_KEY in .env)');
        process.exit(1);
    }

    console.log(`✅ Fetched server workflow: ${serverWf.name}\n`);

    // Compare
    console.log('='.repeat(80));
    console.log('COMPARISON REPORT: ' + workflowName);
    console.log('='.repeat(80));
    console.log(`Local file:  ${localPath}`);
    console.log(`Server ID:   ${workflowId}`);
    console.log(`Server name: ${serverWf.name}`);
    console.log('');

    const allDifferences: string[] = [];

    // Compare nodes
    const localNodes = localWf.nodes || [];
    const serverNodes = serverWf.nodes || [];
    
    console.log(`Node count: LOCAL=${localNodes.length}, SERVER=${serverNodes.length}\n`);
    
    const nodeDiffs = compareNodes(localNodes, serverNodes);
    allDifferences.push(...nodeDiffs);

    // Compare connections
    const connDiffs = compareConnections(localWf.connections, serverWf.connections);
    allDifferences.push(...connDiffs);

    // Compare settings
    if (JSON.stringify(localWf.settings) !== JSON.stringify(serverWf.settings)) {
        allDifferences.push('⚠️ Settings differ:');
        allDifferences.push(`   LOCAL:  ${JSON.stringify(localWf.settings)}`);
        allDifferences.push(`   SERVER: ${JSON.stringify(serverWf.settings)}`);
    }

    // Report
    if (allDifferences.length === 0) {
        console.log('✅✅✅ NO DIFFERENCES FOUND - Workflows are IDENTICAL ✅✅✅\n');
    } else {
        console.log(`❌ FOUND ${allDifferences.length} DIFFERENCES:\n`);
        for (const diff of allDifferences) {
            console.log(diff);
        }
        console.log('');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total differences: ${allDifferences.length}`);
    
    const criticalDiffs = allDifferences.filter(d => d.includes('CRITICAL') || d.includes('parameters DIFFER'));
    if (criticalDiffs.length > 0) {
        console.log(`⚠️  CRITICAL differences: ${criticalDiffs.length} (affect workflow behavior)`);
    }
    
    const uiOnlyDiffs = allDifferences.filter(d => d.includes('UI only') || d.includes('position'));
    if (uiOnlyDiffs.length > 0) {
        console.log(`ℹ️  UI-only differences: ${uiOnlyDiffs.length} (position changes, not functional)`);
    }

    // Save server workflow for reference
    const serverOutputPath = path.join(__dirname, `server_${workflowName}.json`);
    fs.writeFileSync(serverOutputPath, JSON.stringify(serverWf, null, 2));
    console.log(`\n📄 Server workflow saved to: ${serverOutputPath}`);
}

main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
