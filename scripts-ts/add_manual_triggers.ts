#!/usr/bin/env node
/**
 * =============================================================================
 * Add Manual Triggers
 * =============================================================================
 * Purpose: Adds Manual Trigger nodes to workflows missing Triple Entry Pattern
 *
 * Key features:
 *   - Detects workflows missing Manual Trigger
 *   - Adds Manual Trigger connected to first logic node
 *   - Validates node versions against SSOT before modification
 *   - Watchdog-protected (3-minute timeout)
 *   - Creates backup before modification
 *
 * Usage: npx tsx scripts-ts/add_manual_triggers.ts [--dry-run] [--verbose]
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Watchdog, withWatchdog, WATCHDOG_TIMEOUT } from './watchdog';
import { WORKFLOWS_DIR } from './config';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

dotenv.config({ path: path.resolve(__dirname, '.env') });

// SSOT nodes file path
const SSOT_NODES_PATH = path.resolve(
  __dirname,
  'down-val-and-set-nodes',
  'ssot-nodes.json'
);

interface SSOTNode {
  type: string;
  displayName: string;
  latestVersion: number;
  availableVersions: number[];
  group: string[];
}

interface SSOTData {
  _meta: {
    generatedAt: string;
    n8nVersion: string;
    n8nUrl: string;
    totalNodes: number;
  };
  nodes: SSOTNode[];
}

interface WorkflowAnalysis {
  workflowName: string;
  workflowFile: string;
  hasManualTrigger: boolean;
  hasWebhook: boolean;
  hasExecuteWorkflowTrigger: boolean;
  firstLogicNode?: string;
  missingTriggers: string[];
  nodeVersionIssues: NodeVersionIssue[];
}

interface NodeVersionIssue {
  nodeName: string;
  nodeType: string;
  currentVersion: number;
  latestVersion: number;
  available: boolean;
}

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
  fail: (msg: string) => console.log(`${COLORS.red}❌ ${msg}${COLORS.reset}`),
  pass: (msg: string) => console.log(`${COLORS.green}✓ ${msg}${COLORS.reset}`),
  header: (msg: string) => console.log(`\n${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}\n${msg}\n${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}`),
};

let ssotData: SSOTData | null = null;
let dryRun = false;
let verbose = false;

/**
 * Load SSOT nodes data
 */
function loadSSOTNodes(): SSOTData | null {
  if (!fs.existsSync(SSOT_NODES_PATH)) {
    log.warning(`SSOT file not found: ${SSOT_NODES_PATH}`);
    log.info('Run discover_node_types.ts first to generate SSOT data');
    return null;
  }

  try {
    const content = fs.readFileSync(SSOT_NODES_PATH, 'utf-8');
    return JSON.parse(content) as SSOTData;
  } catch (error: any) {
    log.error(`Failed to load SSOT nodes: ${error.message}`);
    return null;
  }
}

/**
 * Get node info from SSOT
 */
function getNodeFromSSOT(nodeType: string): SSOTNode | null {
  if (!ssotData) return null;
  
  const node = ssotData.nodes.find(n => n.type === nodeType);
  return node || null;
}

/**
 * Validate node versions against SSOT
 */
function validateNodeVersions(workflow: any): NodeVersionIssue[] {
  const issues: NodeVersionIssue[] = [];

  for (const node of workflow.nodes || []) {
    const nodeType = node.type;
    const currentVersion = node.typeVersion;
    
    const ssotNode = getNodeFromSSOT(nodeType);
    
    if (!ssotNode) {
      // Unknown node type (might be custom or community node)
      continue;
    }

    const available = ssotNode.availableVersions.includes(currentVersion);
    const latestVersion = ssotNode.latestVersion;

    if (!available || currentVersion < latestVersion) {
      issues.push({
        nodeName: node.name,
        nodeType,
        currentVersion,
        latestVersion,
        available,
      });
    }
  }

  return issues;
}

/**
 * Analyze workflow for Triple Entry Pattern compliance
 */
function analyzeWorkflow(workflow: any, workflowFile: string): WorkflowAnalysis {
  const nodes = workflow.nodes || [];
  
  const hasManualTrigger = nodes.some(
    (n: any) => n.type === 'n8n-nodes-base.manualTrigger'
  );
  
  const hasWebhook = nodes.some(
    (n: any) => n.type === 'n8n-nodes-base.webhook'
  );
  
  const hasExecuteWorkflowTrigger = nodes.some(
    (n: any) => n.type === 'n8n-nodes-base.executeWorkflowTrigger'
  );

  // Find first logic node (non-trigger node that receives connections)
  let firstLogicNode: string | undefined;
  const triggerTypes = [
    'n8n-nodes-base.manualTrigger',
    'n8n-nodes-base.webhook',
    'n8n-nodes-base.executeWorkflowTrigger',
    'n8n-nodes-base.scheduleTrigger',
    'n8n-nodes-base.errorTrigger',
  ];

  // Find nodes that are connected from triggers
  const connections = workflow.connections || {};
  const connectedNodes = new Set<string>();
  
  for (const [sourceNode, sourceConnections] of Object.entries(connections)) {
    const sourceNodeObj = nodes.find((n: any) => n.name === sourceNode);
    if (sourceNodeObj && triggerTypes.includes(sourceNodeObj.type)) {
      // This is a trigger node, find what it connects to
      const mainConnections = sourceConnections as any;
      if (mainConnections.main && mainConnections.main[0]) {
        for (const conn of mainConnections.main[0]) {
          if (conn && conn.node) {
            connectedNodes.add(conn.node);
          }
        }
      }
    }
  }

  // First connected non-trigger node is our first logic node
  for (const nodeName of Array.from(connectedNodes)) {
    const node = nodes.find((n: any) => n.name === nodeName);
    if (node && !triggerTypes.includes(node.type)) {
      firstLogicNode = nodeName;
      break;
    }
  }

  const missingTriggers: string[] = [];
  if (!hasManualTrigger) missingTriggers.push('Manual Trigger');
  if (!hasWebhook) missingTriggers.push('Webhook');
  if (!hasExecuteWorkflowTrigger) missingTriggers.push('Execute Workflow Trigger');

  const nodeVersionIssues = validateNodeVersions(workflow);

  return {
    workflowName: workflow.name || 'Unknown',
    workflowFile,
    hasManualTrigger,
    hasWebhook,
    hasExecuteWorkflowTrigger,
    firstLogicNode,
    missingTriggers,
    nodeVersionIssues,
  };
}

/**
 * Generate unique ID for new node
 */
function generateNodeId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Add Manual Trigger to workflow
 */
function addManualTrigger(workflow: any, analysis: WorkflowAnalysis): boolean {
  if (analysis.hasManualTrigger) {
    return false; // Already has Manual Trigger
  }

  const nodes = workflow.nodes || [];
  
  // Find position for Manual Trigger (align with other triggers)
  let baseX = 0;
  let baseY = 200;
  
  // Try to align with existing triggers
  for (const node of nodes) {
    if (node.type === 'n8n-nodes-base.webhook' || node.type === 'n8n-nodes-base.executeWorkflowTrigger') {
      baseX = node.position?.[0] || 0;
      baseY = Math.min(baseY, (node.position?.[1] || 400) - 200);
      break;
    }
  }

  // Create Manual Trigger node
  const manualTriggerNode = {
    parameters: {},
    name: 'When clicking \'Test workflow\'',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1, // SSOT validated version
    position: [baseX, baseY] as [number, number],
    id: generateNodeId(),
  };

  // Add node to workflow
  workflow.nodes.push(manualTriggerNode);

  // Connect Manual Trigger to first logic node
  if (analysis.firstLogicNode) {
    workflow.connections = workflow.connections || {};
    workflow.connections[manualTriggerNode.name] = {
      main: [
        [
          {
            node: analysis.firstLogicNode,
            type: 'main',
            index: 0,
          },
        ],
      ],
    };
  }

  log.info(`Added Manual Trigger to ${workflow.name}`);
  return true;
}

/**
 * Process single workflow
 */
function processWorkflow(workflowPath: string): boolean {
  const workflowFile = path.basename(workflowPath);
  
  try {
    const content = fs.readFileSync(workflowPath, 'utf-8');
    const workflow = JSON.parse(content);
    
    const analysis = analyzeWorkflow(workflow, workflowFile);
    
    if (verbose) {
      console.log(`\n${COLORS.cyan}Analyzing: ${workflowFile}${COLORS.reset}`);
      console.log(`  Name: ${analysis.workflowName}`);
      console.log(`  Manual Trigger: ${analysis.hasManualTrigger ? '✓' : '✗'}`);
      console.log(`  Webhook: ${analysis.hasWebhook ? '✓' : '✗'}`);
      console.log(`  Execute Workflow Trigger: ${analysis.hasExecuteWorkflowTrigger ? '✓' : '✗'}`);
      
      if (analysis.missingTriggers.length > 0) {
        console.log(`  Missing: ${analysis.missingTriggers.join(', ')}`);
      }
      
      if (analysis.nodeVersionIssues.length > 0) {
        console.log(`  Node version issues: ${analysis.nodeVersionIssues.length}`);
      }
    }

    // Check if Manual Trigger needs to be added
    if (!analysis.hasManualTrigger) {
      if (dryRun) {
        log.info(`[DRY-RUN] Would add Manual Trigger to ${workflow.name}`);
        return false;
      }

      // Create backup
      const backupPath = workflowPath + '.backup';
      fs.writeFileSync(backupPath, content);
      log.info(`Created backup: ${backupPath}`);

      // Add Manual Trigger
      const modified = addManualTrigger(workflow, analysis);
      
      if (modified) {
        // Save modified workflow
        fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
        log.success(`Added Manual Trigger to ${workflow.name}`);
        return true;
      }
    } else {
      log.pass(`${workflow.name} - Already has Manual Trigger`);
    }

    return false;
  } catch (error: any) {
    log.error(`Failed to process ${workflowFile}: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function addManualTriggers() {
  log.header('ADD MANUAL TRIGGERS');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  dryRun = args.includes('--dry-run');
  verbose = args.includes('--verbose') || args.includes('-v');

  if (dryRun) {
    log.info('Running in DRY-RUN mode - no changes will be made');
  }

  log.info('Loading SSOT nodes data...');
  ssotData = loadSSOTNodes();
  
  if (ssotData) {
    log.success(`Loaded SSOT with ${ssotData.nodes.length} node types (n8n v${ssotData._meta.n8nVersion})`);
  }

  // Check if workflows directory exists
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    log.error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
    watchdog.cancel();
    process.exit(1);
  }

  // Get all workflow files
  const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
  
  if (files.length === 0) {
    log.error('No workflow files found');
    watchdog.cancel();
    process.exit(1);
  }

  log.info(`Found ${files.length} workflow files`);

  console.log('\n' + '-'.repeat(70));
  console.log('PROCESSING WORKFLOWS:');
  console.log('-'.repeat(70) + '\n');

  let modifiedCount = 0;
  let alreadyCompliant = 0;

  for (const file of files) {
    const workflowPath = path.join(WORKFLOWS_DIR, file);
    const modified = processWorkflow(workflowPath);
    
    if (modified) {
      modifiedCount++;
    } else {
      alreadyCompliant++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY:');
  console.log('='.repeat(70));
  console.log(`Total workflows: ${files.length}`);
  console.log(`${COLORS.green}✓ Already compliant: ${alreadyCompliant}${COLORS.reset}`);
  console.log(`${COLORS.yellow}✗ Modified (added Manual Trigger): ${modifiedCount}${COLORS.reset}`);

  if (dryRun && modifiedCount > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('DRY-RUN MODE:');
    console.log('-'.repeat(70));
    console.log('No changes were made. Run without --dry-run to apply changes.');
  }

  // Cancel watchdog on successful completion
  watchdog.cancel();
  
  console.log('\n' + '='.repeat(70));
  log.success('Manual Trigger addition complete!');
  console.log('='.repeat(70) + '\n');
}

// Run main function
addManualTriggers().catch(error => {
  log.error(`Script failed: ${error.message}`);
  console.error(error);
  watchdog.cancel();
  process.exit(1);
});
