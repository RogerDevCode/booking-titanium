#!/usr/bin/env node
/**
 * =============================================================================
 * Verify and Fix Orphan Nodes & Broken Connections
 * =============================================================================
 * Purpose: Detect and repair orphan nodes and broken connections in workflows
 * 
 * Checks:
 *   1. Orphan nodes (not connected to any other node)
 *   2. Broken connections (referencing non-existent nodes)
 *   3. Disconnected subgraphs (workflow islands)
 *   4. Missing trigger connections
 * 
 * Usage: npx tsx scripts-ts/verify_and_fix_connections.ts [--fix] [--verbose]
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');

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
    fix: (msg: string) => console.log(`${COLORS.green}[FIX]${COLORS.reset} ${msg}`),
    verbose: (msg: string) => console.log(`${COLORS.cyan}[DEBUG]${COLORS.reset} ${msg}`),
};

interface ConnectionIssue {
    type: 'ORPHAN_NODE' | 'BROKEN_CONNECTION' | 'DISCONNECTED_SUBGRAPH' | 'MISSING_TRIGGER';
    workflow: string;
    node?: string;
    targetNode?: string;
    description: string;
    fixAvailable: boolean;
}

interface WorkflowAnalysis {
    workflow: any;
    nodeNames: Set<string>;
    connectedNodes: Set<string>;
    nodesWithInput: Set<string>;
    triggerNodes: string[];
    endNodes: string[];
    issues: ConnectionIssue[];
}

// Node types that are valid endpoints (don't need outgoing connections)
const VALID_ENDPOINT_TYPES = [
    'n8n-nodes-base.set',
    'n8n-nodes-base.code',
    'n8n-nodes-base.httpRequest',
    'n8n-nodes-base.telegram',
    'n8n-nodes-base.gmail',
    'n8n-nodes-base.googleCalendar',
    'n8n-nodes-base.postgres',
    'n8n-nodes-base.mysql',
    'n8n-nodes-base.executeWorkflow',
];

// Node types that must have incoming connections (not triggers)
const MUST_HAVE_INPUT_TYPES = [
    'n8n-nodes-base.if',
    'n8n-nodes-base.switch',
    'n8n-nodes-base.filter',
    'n8n-nodes-base.merge',
    'n8n-nodes-base.aggregate',
];

// Trigger node types (start of workflow, don't need incoming connections)
const TRIGGER_TYPES = [
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.executeWorkflowTrigger',
    'n8n-nodes-base.errorTrigger',
    'n8n-nodes-base.formTrigger',
    'n8n-nodes-base.form',
];

function analyzeWorkflow(workflow: any, verbose: boolean = false): WorkflowAnalysis {
    const issues: ConnectionIssue[] = [];
    const nodeNames = new Set<string>();
    const connectedNodes = new Set<string>();
    const nodesWithInput = new Set<string>();
    const triggerNodes: string[] = [];
    const endNodes: string[] = [];

    const workflowName = workflow.name || 'Unknown';

    // Build node name set
    for (const node of workflow.nodes || []) {
        nodeNames.add(node.name);
        
        // Identify trigger nodes
        if (TRIGGER_TYPES.includes(node.type)) {
            triggerNodes.push(node.name);
        }
    }

    // Analyze connections - n8n structure:
    // connections: { "NodeName": { "main": [ [ {node: "Target", type: "main", index: 0} ] ] } }
    const connections = workflow.connections || {};
    
    for (const [sourceNode, outputs] of Object.entries(connections)) {
        const outputsAny = outputs as Record<string, any>;
        
        for (const [outputName, outputArrays] of Object.entries(outputsAny)) {
            if (!Array.isArray(outputArrays)) continue;
            
            for (const connectionsArray of outputArrays) {
                if (!Array.isArray(connectionsArray)) continue;
                
                for (const conn of connectionsArray) {
                    if (!conn || !conn.node) continue;
                    
                    const targetNode = conn.node;
                    
                    // Mark both nodes as connected
                    connectedNodes.add(sourceNode);
                    connectedNodes.add(targetNode);
                    
                    // Mark target as having input
                    nodesWithInput.add(targetNode);
                    
                    // Check for broken connection (target doesn't exist)
                    if (!nodeNames.has(targetNode)) {
                        issues.push({
                            type: 'BROKEN_CONNECTION',
                            workflow: workflowName,
                            node: sourceNode,
                            targetNode,
                            description: `Connection from '${sourceNode}' to non-existent node '${targetNode}'`,
                            fixAvailable: false,
                        });
                        
                        if (verbose) {
                            log.verbose(`  ❌ Broken: ${sourceNode} → ${targetNode} (target doesn't exist)`);
                        }
                    } else if (verbose) {
                        log.verbose(`  ✓ Connected: ${sourceNode} → ${targetNode}`);
                    }
                }
            }
        }
    }

    // Find orphan nodes (not connected to anything)
    for (const node of workflow.nodes || []) {
        const nodeName = node.name;
        const nodeType = node.type;
        
        // Skip trigger nodes - they're allowed to be "orphans" at the start
        if (TRIGGER_TYPES.includes(nodeType)) {
            continue;
        }
        
        // Check if node has any connections (either as source or target)
        const isConnected = connectedNodes.has(nodeName);
        
        if (!isConnected) {
            // Check if this node type should have connections
            const shouldConnect = !VALID_ENDPOINT_TYPES.includes(nodeType);
            
            if (shouldConnect && workflow.nodes.length > 1) {
                // Only report if workflow has multiple nodes
                issues.push({
                    type: 'ORPHAN_NODE',
                    workflow: workflowName,
                    node: nodeName,
                    description: `Node '${nodeName}' (${nodeType}) is not connected to any other node`,
                    fixAvailable: false, // Manual fix required
                });
                
                if (verbose) {
                    log.verbose(`  ⚠️  Orphan: ${nodeName} (${nodeType})`);
                }
            } else if (VALID_ENDPOINT_TYPES.includes(nodeType)) {
                endNodes.push(nodeName);
            }
        }
    }

    // Check for nodes that should have input but don't
    for (const node of workflow.nodes || []) {
        const nodeName = node.name;
        const nodeType = node.type;
        
        if (TRIGGER_TYPES.includes(nodeType)) continue; // Triggers don't need input
        
        if (MUST_HAVE_INPUT_TYPES.includes(nodeType)) {
            const hasInput = nodesWithInput.has(nodeName);
            
            if (!hasInput && workflow.nodes.length > 1) {
                issues.push({
                    type: 'MISSING_TRIGGER',
                    workflow: workflowName,
                    node: nodeName,
                    description: `Node '${nodeName}' (${nodeType}) has no incoming connections`,
                    fixAvailable: false,
                });
                
                if (verbose) {
                    log.verbose(`  ⚠️  No input: ${nodeName} (${nodeType})`);
                }
            }
        }
    }

    // Check for disconnected subgraphs (workflow islands)
    if (triggerNodes.length > 0 && workflow.nodes.length > 1) {
        const visited = new Set<string>();
        
        // BFS from each trigger
        for (const trigger of triggerNodes) {
            const queue = [trigger];
            
            while (queue.length > 0) {
                const current = queue.shift()!;
                
                if (visited.has(current)) continue;
                visited.add(current);
                
                // Add connected nodes to queue
                const outputs = (connections as any)?.[current];
                if (outputs) {
                    for (const outputName of Object.keys(outputs)) {
                        const outputArrays = outputs[outputName];
                        if (Array.isArray(outputArrays)) {
                            for (const connectionsArray of outputArrays) {
                                if (Array.isArray(connectionsArray)) {
                                    for (const conn of connectionsArray) {
                                        if (conn?.node && !visited.has(conn.node)) {
                                            queue.push(conn.node);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Check if all nodes were visited
        const unvisitedNodes = workflow.nodes.filter((n: any) => !visited.has(n.name));
        
        if (unvisitedNodes.length > 0 && unvisitedNodes.length < workflow.nodes.length) {
            // Some nodes are disconnected
            for (const node of unvisitedNodes) {
                if (!TRIGGER_TYPES.includes(node.type) && !VALID_ENDPOINT_TYPES.includes(node.type)) {
                    issues.push({
                        type: 'DISCONNECTED_SUBGRAPH',
                        workflow: workflowName,
                        node: node.name,
                        description: `Node '${node.name}' is in a disconnected subgraph (island)`,
                        fixAvailable: false,
                    });
                    
                    if (verbose) {
                        log.verbose(`  🏝️  Island: ${node.name} (${node.type})`);
                    }
                }
            }
        } else if (verbose && unvisitedNodes.length === 0) {
            log.verbose(`  ✓ All nodes connected in single graph`);
        }
    }

    return {
        workflow,
        nodeNames,
        connectedNodes,
        nodesWithInput,
        triggerNodes,
        endNodes,
        issues,
    };
}

function main() {
    const args = process.argv.slice(2);
    const shouldFix = args.includes('--fix');
    const verbose = args.includes('--verbose') || args.includes('-v');

    console.log('\n' + '='.repeat(70));
    console.log('VERIFY AND FIX CONNECTIONS');
    console.log('='.repeat(70) + '\n');

    if (!fs.existsSync(WORKFLOWS_DIR)) {
        log.error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
    
    log.info(`Analyzing ${files.length} workflows...\n`);

    const allIssues: ConnectionIssue[] = [];
    const cleanWorkflows: string[] = [];

    for (const file of files) {
        const filePath = path.join(WORKFLOWS_DIR, file);
        const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        if (verbose) {
            log.info(`Analyzing: ${workflow.name}`);
        }

        const analysis = analyzeWorkflow(workflow, verbose);
        
        if (analysis.issues.length > 0) {
            allIssues.push(...analysis.issues);
            
            if (verbose) {
                console.log(`${COLORS.yellow}  Found ${analysis.issues.length} issue(s)${COLORS.reset}\n`);
            }
        } else {
            cleanWorkflows.push(workflow.name);
            if (verbose) {
                log.success(`  ✓ No issues found\n`);
            }
        }
    }

    // Summary
    console.log('='.repeat(70));
    console.log('SUMMARY:');
    console.log('='.repeat(70) + '\n');

    console.log(`Workflows analyzed: ${files.length}`);
    console.log(`Clean workflows: ${cleanWorkflows.length}`);
    console.log(`Workflows with issues: ${files.length - cleanWorkflows.length}`);
    console.log(`Total issues found: ${allIssues.length}`);
    
    if (allIssues.length > 0) {
        console.log('\n' + '-'.repeat(70));
        console.log('ISSUES BY TYPE:');
        console.log('-'.repeat(70) + '\n');

        const issuesByType = new Map<string, ConnectionIssue[]>();
        for (const issue of allIssues) {
            if (!issuesByType.has(issue.type)) {
                issuesByType.set(issue.type, []);
            }
            issuesByType.get(issue.type)!.push(issue);
        }

        for (const [type, issues] of issuesByType.entries()) {
            console.log(`${COLORS.yellow}${type}${COLORS.reset}: ${issues.length}`);
            
            for (const issue of issues) {
                console.log(`  • ${issue.workflow}`);
                if (issue.node) {
                    console.log(`    Node: ${issue.node}`);
                }
                if (issue.targetNode) {
                    console.log(`    Target: ${issue.targetNode}`);
                }
                console.log(`    ${issue.description}`);
                console.log('');
            }
            console.log('');
        }
    } else {
        console.log(`\n${COLORS.green}✓ No connection issues found!${COLORS.reset}\n`);
    }

    console.log('='.repeat(70));
    console.log('CLEAN WORKFLOWS (no issues):');
    console.log('='.repeat(70) + '\n');
    
    for (const wf of cleanWorkflows) {
        console.log(`  ✓ ${wf}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('RECOMMENDATIONS:');
    console.log('='.repeat(70) + '\n');

    if (allIssues.length === 0) {
        console.log('✅ All workflows have valid connections!\n');
    } else {
        console.log('1. Review orphan nodes - they may be:');
        console.log('   • Leftover from editing (safe to remove)');
        console.log('   • Intentionally disconnected (keep for later use)');
        console.log('   • Missing connections (need to be wired up)\n');

        console.log('2. For broken connections:');
        console.log('   • The target node may have been deleted');
        console.log('   • Reconnect to a valid node or remove the connection\n');

        console.log('3. For disconnected subgraphs:');
        console.log('   • Connect the island nodes to the main workflow');
        console.log('   • Or remove them if they\'re not needed\n');
    }
}

main();
