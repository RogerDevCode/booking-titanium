#!/usr/bin/env node
/**
 * =============================================================================
 * Deep Workflow Analyzer - Find propertyValues iterable issues
 * =============================================================================
 * Purpose: Deep analysis of workflow JSON to find malformed fixedCollection
 *          structures that cause "propertyValues[itemName] is not iterable"
 * 
 * Usage: npx tsx scripts-ts/analyze_workflow.ts <workflow-file>
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '.env') });

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
    debug: (msg: string) => console.log(`${COLORS.cyan}[DEBUG]${COLORS.reset} ${msg}`),
};

// Known fixedCollection fields by node type
const FIXED_COLLECTION_FIELDS: Record<string, string[]> = {
    'n8n-nodes-base.if': ['conditions'],
    'n8n-nodes-base.switch': ['conditions', 'options'],
    'n8n-nodes-base.filter': ['conditions', 'filters'],
    'n8n-nodes-base.code': ['assignments'],
    'n8n-nodes-base.set': ['assignments', 'values'],
    'n8n-nodes-base.httpRequest': ['options', 'headers', 'queryParameters'],
    'n8n-nodes-base.googleCalendar': ['filters', 'options', 'additionalFields'],
    'n8n-nodes-base.telegram': ['additionalFields'],
    'n8n-nodes-base.executeWorkflowTrigger': ['inputSource'],
    'n8n-nodes-base.manualTrigger': [],
    'n8n-nodes-base.webhook': ['options'],
    'n8n-nodes-base.errorTrigger': [],
};

interface Issue {
    node: string;
    nodeType: string;
    field: string;
    issue: string;
    currentValue: any;
    expectedType: string;
}

function analyzeValue(value: any, path: string, issues: Issue[], nodeName: string, nodeType: string) {
    if (value === null) {
        issues.push({
            node: nodeName,
            nodeType,
            field: path,
            issue: 'Value is null (should be object or array)',
            currentValue: null,
            expectedType: 'object|array'
        });
        return;
    }

    if (value === undefined) {
        return; // Skip undefined
    }

    const type = typeof value;

    if (type === 'object') {
        const isArray = Array.isArray(value);
        
        // Check for empty objects that should be arrays
        if (!isArray && Object.keys(value).length === 0) {
            // Empty object - might be okay, but flag for certain fields
            if (path.includes('conditions') || path.includes('assignments') || path.includes('filters')) {
                issues.push({
                    node: nodeName,
                    nodeType,
                    field: path,
                    issue: 'Empty object (might need to be empty array [])',
                    currentValue: {},
                    expectedType: 'array'
                });
            }
        }

        // Recursively analyze nested objects
        for (const [key, val] of Object.entries(value)) {
            analyzeValue(val, `${path}.${key}`, issues, nodeName, nodeType);
        }
    }
}

function analyzeNode(node: any): Issue[] {
    const issues: Issue[] = [];
    const nodeName = node.name || 'Unknown';
    const nodeType = node.type || 'Unknown';
    const params = node.parameters || {};

    // Get expected collection fields for this node type
    const expectedFields = FIXED_COLLECTION_FIELDS[nodeType] || [];

    // Also check common collection field names
    const commonFields = ['conditions', 'assignments', 'filters', 'options', 'values', 'additionalFields', 'inputSource'];

    for (const [fieldName, fieldValue] of Object.entries(params)) {
        const fieldPath = `parameters.${fieldName}`;

        // Check for null values
        if (fieldValue === null) {
            issues.push({
                node: nodeName,
                nodeType,
                field: fieldPath,
                issue: 'Parameter is null',
                currentValue: null,
                expectedType: 'object'
            });
            continue;
        }

        // Check for fields that should have nested arrays
        if (typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue)) {
            // Check if this field has a nested property with the same name
            // This is a common pattern for fixedCollections in n8n
            const nestedValue = (fieldValue as any)[fieldName];
            
            if (nestedValue !== undefined && !Array.isArray(nestedValue)) {
                issues.push({
                    node: nodeName,
                    nodeType,
                    field: `${fieldPath}.${fieldName}`,
                    issue: `Nested '${fieldName}' should be an array but is ${typeof nestedValue}`,
                    currentValue: nestedValue,
                    expectedType: 'array'
                });
            }

            // Check for 'assignments' pattern specifically
            if (fieldName === 'assignments' && (fieldValue as any).assignments !== undefined) {
                const assignmentsValue = (fieldValue as any).assignments;
                if (!Array.isArray(assignmentsValue)) {
                    issues.push({
                        node: nodeName,
                        nodeType,
                        field: `${fieldPath}.assignments`,
                        issue: `assignments.assignments should be an array but is ${typeof assignmentsValue}`,
                        currentValue: assignmentsValue,
                        expectedType: 'array'
                    });
                }
            }

            // Check for 'conditions' pattern
            if (fieldName === 'conditions' && (fieldValue as any).conditions !== undefined) {
                const conditionsValue = (fieldValue as any).conditions;
                if (!Array.isArray(conditionsValue)) {
                    issues.push({
                        node: nodeName,
                        nodeType,
                        field: `${fieldPath}.conditions`,
                        issue: `conditions.conditions should be an array but is ${typeof conditionsValue}`,
                        currentValue: conditionsValue,
                        expectedType: 'array'
                    });
                }
            }

            // Check for 'options' with combinator pattern (common in IF/Switch nodes)
            if (fieldName === 'options' && typeof (fieldValue as any) === 'object') {
                const options = fieldValue as Record<string, any>;
                
                // Check if options has 'combinator' but no proper structure
                if (options.combinator !== undefined && options.conditions === undefined) {
                    issues.push({
                        node: nodeName,
                        nodeType,
                        field: `${fieldPath}`,
                        issue: 'options has combinator but no conditions array',
                        currentValue: fieldValue,
                        expectedType: 'object with conditions array'
                    });
                }
            }
        }

        // Deep analyze all values
        analyzeValue(fieldValue, fieldPath, issues, nodeName, nodeType);
    }

    return issues;
}

function analyzeWorkflow(filePath: string) {
    console.log('\n' + '='.repeat(70));
    console.log('DEEP WORKFLOW ANALYSIS - propertyValues iterable check');
    console.log('='.repeat(70) + '\n');

    if (!fs.existsSync(filePath)) {
        log.error(`File not found: ${filePath}`);
        return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const workflow = JSON.parse(content);

    log.info(`Analyzing: ${workflow.name || filePath}`);
    log.info(`Total nodes: ${workflow.nodes?.length || 0}\n`);

    const allIssues: Issue[] = [];

    for (const node of workflow.nodes || []) {
        const nodeIssues = analyzeNode(node);
        if (nodeIssues.length > 0) {
            allIssues.push(...nodeIssues);
        }
    }

    if (allIssues.length === 0) {
        log.success('No obvious propertyValues issues detected!\n');
        log.warning('Note: The error might be caused by:');
        console.log('  1. Node type version incompatibility');
        console.log('  2. Corrupted node internal state');
        console.log('  3. n8n server-side caching issue\n');
    } else {
        log.fail(`Found ${allIssues.length} potential issue(s):\n`);

        for (const issue of allIssues) {
            console.log(`${COLORS.red}────────────────────────────────────────────────────────────────────${COLORS.reset}`);
            console.log(`${COLORS.yellow}Node:${COLORS.reset} ${issue.node} (${issue.nodeType})`);
            console.log(`${COLORS.yellow}Field:${COLORS.reset} ${issue.field}`);
            console.log(`${COLORS.yellow}Issue:${COLORS.reset} ${issue.issue}`);
            console.log(`${COLORS.yellow}Expected:${COLORS.reset} ${issue.expectedType}`);
            
            if (issue.currentValue !== null && issue.currentValue !== undefined) {
                const valueStr = JSON.stringify(issue.currentValue, null, 2);
                const preview = valueStr.length > 200 ? valueStr.substring(0, 200) + '...' : valueStr;
                console.log(`${COLORS.yellow}Current:${COLORS.reset} ${preview}`);
            }
            console.log('');
        }
    }

    // Show node summary
    console.log('='.repeat(70));
    console.log('NODE TYPE SUMMARY:');
    console.log('='.repeat(70));
    
    const nodeTypeCount: Record<string, number> = {};
    for (const node of workflow.nodes || []) {
        nodeTypeCount[node.type] = (nodeTypeCount[node.type] || 0) + 1;
    }
    
    for (const [type, count] of Object.entries(nodeTypeCount)) {
        const hasIssues = allIssues.some(i => i.nodeType === type);
        const marker = hasIssues ? `${COLORS.red} ⚠️${COLORS.reset}` : '';
        console.log(`  ${type}: ${count}${marker}`);
    }
    console.log('');
}

// Main
const workflowFile = process.argv[2];

if (!workflowFile) {
    console.log('Usage: npx tsx scripts-ts/analyze_workflow.ts <workflow-file.json>');
    console.log('\nExamples:');
    console.log('  npx tsx scripts-ts/analyze_workflow.ts workflows/GCAL_Create_Event.json');
    console.log('  npx tsx scripts-ts/analyze_workflow.ts workflows/NN_04_Telegram_Sender.json\n');
    process.exit(1);
}

const filePath = path.resolve(workflowFile);
analyzeWorkflow(filePath);
