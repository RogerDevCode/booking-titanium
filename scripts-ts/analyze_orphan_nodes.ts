#!/usr/bin/env node
/**
 * =============================================================================
 * Analyze Orphan Nodes in Workflow
 * =============================================================================
 * Purpose: Detect orphan nodes (no input/output connections) and validate flow
 * Usage: npx tsx scripts-ts/analyze_orphan_nodes.ts <workflow.json>
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';

const workflowPath = process.argv[2];

if (!workflowPath) {
    console.error('Usage: npx tsx scripts-ts/analyze_orphan_nodes.ts <workflow.json>');
    process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const nodes = workflow.nodes || [];
const connections = workflow.connections || {};

console.log('\n' + '='.repeat(80));
console.log('ORPHAN NODE ANALYSIS: ' + path.basename(workflowPath));
console.log('='.repeat(80) + '\n');

// Build connection maps
const hasOutput = new Map<string, boolean>(); // nodes that send data somewhere
const hasInput = new Map<string, boolean>();  // nodes that receive data from somewhere

// Parse connections
for (const [sourceNode, outputs] of Object.entries(connections)) {
    const typedOutputs = outputs as any;
    for (const outputType of Object.keys(typedOutputs)) {
        const connectionsOfType = typedOutputs[outputType];
        if (Array.isArray(connectionsOfType)) {
            for (const connArray of connectionsOfType) {
                if (Array.isArray(connArray)) {
                    for (const conn of connArray) {
                        if (conn.node) {
                            hasOutput.set(sourceNode, true);
                            hasInput.set(conn.node, true);
                        }
                    }
                }
            }
        }
    }
}

// Analyze each node
const triggerTypes = [
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.executeWorkflowTrigger',
];

const issues: string[] = [];

console.log('NODE CONNECTION STATUS:');
console.log('-'.repeat(80));

for (const node of nodes) {
    const isTrigger = triggerTypes.includes(node.type);
    const hasOut = hasOutput.has(node.name);
    const hasIn = hasInput.has(node.name);
    
    let status = '✅';
    let notes: string[] = [];

    // Triggers should have output but not necessarily input
    if (isTrigger) {
        if (!hasOut) {
            status = '❌';
            notes.push('TRIGGER with NO OUTPUT - workflow will not execute!');
            issues.push(`Node '${node.name}': Trigger without output connection`);
        } else {
            notes.push('Trigger (entry point)');
        }
    } else {
        // Non-trigger nodes should have both input and output (unless they're terminal nodes)
        if (!hasIn && !hasOut) {
            status = '❌';
            notes.push('COMPLETELY ORPHAN - no connections at all!');
            issues.push(`Node '${node.name}': Completely orphan (no input, no output)`);
        } else if (!hasIn) {
            status = '⚠️';
            notes.push('NO INPUT - will receive undefined data');
            issues.push(`Node '${node.name}': No input connection`);
        } else if (!hasOut) {
            status = 'ℹ️';
            notes.push('Terminal node (end of flow)');
        }
    }

    console.log(`${status} ${node.name}`);
    console.log(`   Type: ${node.type} v${node.typeVersion}`);
    console.log(`   Connections: Input=${hasIn ? 'YES' : 'NO'}, Output=${hasOut ? 'YES' : 'NO'}`);
    if (notes.length > 0) {
        console.log(`   Notes: ${notes.join(', ')}`);
    }
    console.log('');
}

// Check for specific node: "Extract & Validate (PRE)"
console.log('='.repeat(80));
console.log('DETAILED ANALYSIS: Extract & Validate (PRE)');
console.log('='.repeat(80) + '\n');

const extractNode = nodes.find(n => n.name === 'Extract & Validate (PRE)');
if (!extractNode) {
    console.log('❌ Node "Extract & Validate (PRE)" NOT FOUND in workflow!\n');
} else {
    console.log('✅ Node found:');
    console.log(`   ID: ${extractNode.id}`);
    console.log(`   Type: ${extractNode.type} v${extractNode.typeVersion}`);
    console.log(`   Position: [${extractNode.position}]`);
    console.log('');

    // Check if it receives connections
    const receivesFrom = [];
    for (const [sourceNode, outputs] of Object.entries(connections)) {
        const typedOutputs = outputs as any;
        for (const outputType of Object.keys(typedOutputs)) {
            const connArray = typedOutputs[outputType];
            if (Array.isArray(connArray)) {
                for (const arr of connArray) {
                    if (Array.isArray(arr)) {
                        for (const conn of arr) {
                            if (conn.node === 'Extract & Validate (PRE)') {
                                receivesFrom.push(sourceNode);
                            }
                        }
                    }
                }
            }
        }
    }

    // Check if it sends connections
    const sendsTo = connections['Extract & Validate (PRE)'] as any;
    const sendsToNodes: string[] = [];
    if (sendsTo) {
        for (const outputType of Object.keys(sendsTo)) {
            const connArray = sendsTo[outputType];
            if (Array.isArray(connArray)) {
                for (const arr of connArray) {
                    if (Array.isArray(arr)) {
                        for (const conn of arr) {
                            if (conn.node) {
                                sendsToNodes.push(conn.node);
                            }
                        }
                    }
                }
            }
        }
    }

    console.log('CONNECTION FLOW:');
    console.log(`   Receives from: ${receivesFrom.length > 0 ? receivesFrom.join(', ') : '❌ NO ONE'}`);
    console.log(`   Sends to: ${sendsToNodes.length > 0 ? sendsToNodes.join(', ') : '❌ NO ONE'}`);
    console.log('');

    // Validate the node is properly connected
    if (receivesFrom.length === 0) {
        console.log('❌ CRITICAL: This node has NO INPUT connections!');
        console.log('   It will receive undefined data when executed.');
        console.log('   Triggers should connect to this node.');
        issues.push('Extract & Validate (PRE): No input connections from triggers');
    } else {
        console.log('✅ Node properly receives data from triggers');
    }

    if (sendsToNodes.length === 0) {
        console.log('❌ CRITICAL: This node has NO OUTPUT connections!');
        console.log('   Data processed here will not flow to subsequent nodes.');
        issues.push('Extract & Validate (PRE): No output connections');
    } else {
        console.log('✅ Node properly sends data to next step');
    }

    // Check Code node validity
    console.log('\nCODE NODE VALIDATION:');
    const code = extractNode.parameters?.jsCode || '';
    
    // Check for common issues
    const checks = [
        { name: 'Uses $input.first()', test: code.includes('$input.first()') },
        { name: 'Returns array', test: code.includes('return [') },
        { name: 'Has json property', test: code.includes('json:') },
        { name: 'Validates input', test: code.includes('isValid') || code.includes('valid') },
        { name: 'No $env access', test: !code.includes('$env') },
    ];

    for (const check of checks) {
        console.log(`   ${check.test ? '✅' : '❌'} ${check.name}`);
    }
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Total nodes: ${nodes.length}`);
console.log(`Issues found: ${issues.length}`);

if (issues.length === 0) {
    console.log('\n✅ NO ORPHAN NODES - All nodes are properly connected\n');
} else {
    console.log('\n❌ ISSUES DETECTED:\n');
    for (const issue of issues) {
        console.log(`   • ${issue}`);
    }
    console.log('');
}
