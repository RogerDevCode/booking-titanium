#!/usr/bin/env node
/**
 * =============================================================================
 * Verify Workflow Sync
 * =============================================================================
 * Purpose: Verifies synchronization between local workflows and server workflows
 *
 * Key features:
 *   - Detects ID mismatches (local vs server)
 *   - Identifies unpublished workflows
 *   - Validates node versions against SSOT
 *   - Watchdog-protected (3-minute timeout)
 *
 * Usage: npx tsx scripts-ts/verify_workflow_sync.ts [--verbose]
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';
import { Watchdog, withWatchdog, WATCHDOG_TIMEOUT } from './watchdog';
import { N8NConfig, WORKFLOWS_DIR } from './config';

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

interface WorkflowSyncIssue {
  workflowName: string;
  workflowFile: string;
  localId?: string;
  serverId?: string;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  nodeIssues?: NodeVersionIssue[];
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

let api: AxiosInstance;
let ssotData: SSOTData | null = null;

/**
 * Initialize API client
 */
function initApi() {
  const config = new N8NConfig();
  
  api = axios.create({
    baseURL: config.api_url,
    headers: {
      'X-N8N-API-Key': config.api_key,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

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
 * Fetch all workflows from server
 */
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

/**
 * Load local workflows
 */
function loadLocalWorkflows() {
  log.info('Loading local workflows...');
  
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    log.error(`Workflows directory not found: ${WORKFLOWS_DIR}`);
    return [];
  }

  const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
  const workflows: any[] = [];

  for (const file of files) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    try {
      const workflow = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      workflow._file = file;
      workflows.push(workflow);
    } catch (error: any) {
      log.error(`Failed to load ${file}: ${error.message}`);
    }
  }

  log.success(`Loaded ${workflows.length} workflows`);
  return workflows;
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
 * Check sync status for a workflow
 */
function checkWorkflowSync(
  localWorkflow: any,
  serverWorkflows: any[]
): WorkflowSyncIssue | null {
  const workflowName = localWorkflow.name;
  const workflowFile = localWorkflow._file;
  const localId = localWorkflow.id;

  // Check if workflow exists on server
  if (serverWorkflows.length === 0) {
    return {
      workflowName,
      workflowFile,
      localId,
      issue: 'Workflow not found on server',
      severity: 'error',
    };
  }

  // Check for ID mismatch
  const serverById = serverWorkflows.find(wf => wf.id === localId);
  const serverByName = serverWorkflows.find(wf => wf.name === workflowName);

  if (!serverById && serverByName) {
    return {
      workflowName,
      workflowFile,
      localId,
      serverId: serverByName.id,
      issue: 'ID mismatch - local ID does not match server ID',
      severity: 'error',
    };
  }

  // Check if published
  if (serverById && !serverById.active) {
    return {
      workflowName,
      workflowFile,
      localId,
      serverId: serverById.id,
      issue: 'Workflow exists but is NOT PUBLISHED',
      severity: 'warning',
    };
  }

  // Check node versions
  const nodeIssues = validateNodeVersions(localWorkflow);
  
  if (nodeIssues.length > 0) {
    return {
      workflowName,
      workflowFile,
      localId,
      serverId: serverById?.id,
      issue: 'Node version issues detected',
      severity: 'warning',
      nodeIssues,
    };
  }

  return null;
}

/**
 * Main verification function
 */
async function verifyWorkflowSync() {
  log.header('VERIFY WORKFLOW SYNC');
  
  log.info('Initializing API client...');
  initApi();

  log.info('Loading SSOT nodes data...');
  ssotData = loadSSOTNodes();
  
  if (ssotData) {
    log.success(`Loaded SSOT with ${ssotData.nodes.length} node types (n8n v${ssotData._meta.n8nVersion})`);
  }

  // Load local workflows
  const localWorkflows = loadLocalWorkflows();
  
  if (localWorkflows.length === 0) {
    log.error('No local workflows found');
    watchdog.cancel();
    process.exit(1);
  }

  // Get server workflows
  log.info('Fetching server workflows...');
  const { idToWorkflow, nameToWorkflows } = await getServerWorkflows();
  
  if (idToWorkflow.size === 0) {
    log.error('No server workflows found or API error');
    watchdog.cancel();
    process.exit(1);
  }
  
  log.success(`Found ${idToWorkflow.size} workflows on server`);

  // Verify each workflow
  console.log('\n' + '-'.repeat(70));
  console.log('SYNC VERIFICATION RESULTS:');
  console.log('-'.repeat(70) + '\n');

  let syncCount = 0;
  let issueCount = 0;
  let unpublishedCount = 0;
  const issues: WorkflowSyncIssue[] = [];

  for (const workflow of localWorkflows) {
    const workflowName = workflow.name;
    const serverWorkflows = nameToWorkflows.get(workflowName) || [];
    
    const issue = checkWorkflowSync(workflow, serverWorkflows);
    
    if (issue) {
      issueCount++;
      issues.push(issue);

      if (issue.severity === 'error') {
        log.fail(`${workflow.workflowFile} (${workflowName})`);
      } else {
        log.warning(`${workflow.workflowFile} (${workflowName})`);
      }
      
      console.log(`   Issue: ${issue.issue}`);
      
      if (issue.serverId) {
        console.log(`   Server ID: ${issue.serverId}`);
      }
      
      if (issue.nodeIssues && issue.nodeIssues.length > 0) {
        console.log(`   Node version issues: ${issue.nodeIssues.length}`);
        for (const nodeIssue of issue.nodeIssues) {
          const status = nodeIssue.available ? 'outdated' : 'invalid';
          console.log(
            `     - ${nodeIssue.nodeName} (${nodeIssue.nodeType}): ` +
            `v${nodeIssue.currentVersion} → v${nodeIssue.latestVersion} [${status}]`
          );
        }
      }
      
      if (issue.severity === 'warning' && issue.issue.includes('NOT PUBLISHED')) {
        unpublishedCount++;
      }
      
      console.log('');
    } else {
      syncCount++;
      log.pass(`${workflow._file} (${workflow.name}) - SYNC OK`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY:');
  console.log('='.repeat(70));
  console.log(`Total workflows: ${localWorkflows.length}`);
  console.log(`${COLORS.green}✓ In sync: ${syncCount}${COLORS.reset}`);
  console.log(`${COLORS.yellow}⚠️  With issues: ${issueCount}${COLORS.reset}`);
  console.log(`${COLORS.yellow}  - Unpublished: ${unpublishedCount}${COLORS.reset}`);
  
  const errorCount = issues.filter(i => i.severity === 'error').length;
  if (errorCount > 0) {
    console.log(`${COLORS.red}  - Errors: ${errorCount}${COLORS.reset}`);
  }

  // Recommendations
  if (issues.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('RECOMMENDED ACTIONS:');
    console.log('-'.repeat(70) + '\n');

    const idMismatches = issues.filter(i => i.issue.includes('ID mismatch'));
    const unpublished = issues.filter(i => i.issue.includes('NOT PUBLISHED'));
    const notFound = issues.filter(i => i.issue.includes('not found on server'));
    const nodeVersionIssues = issues.filter(i => i.nodeIssues && i.nodeIssues.length > 0);

    if (idMismatches.length > 0) {
      console.log('1. Update workflow IDs to match server:');
      console.log('   npx tsx scripts-ts/update_references.ts\n');
    }

    if (notFound.length > 0) {
      console.log('2. Upload missing workflows:');
      console.log('   npx tsx scripts-ts/n8n_push_v2.ts --name <NAME> --file workflows/<FILE>.json --activate\n');
    }

    if (unpublished.length > 0) {
      console.log('3. Publish unpublished workflows:');
      console.log('   npx tsx scripts-ts/n8n_push_v2.ts --name <NAME> --file workflows/<FILE>.json --activate\n');
    }

    if (nodeVersionIssues.length > 0) {
      console.log('4. Fix node versions:');
      console.log('   npx tsx scripts-ts/fix_node_versions.ts workflows/<FILE>.json');
      console.log('   npx tsx scripts-ts/apply_all_fixes.ts  # All workflows\n');
    }
  } else {
    console.log('\n' + '='.repeat(70));
    log.success('All workflows are in sync!');
    console.log('='.repeat(70) + '\n');
  }

  // Cancel watchdog on successful completion
  watchdog.cancel();
  
  // Exit with error code if issues found
  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run main function
verifyWorkflowSync().catch(error => {
  log.error(`Script failed: ${error.message}`);
  console.error(error);
  watchdog.cancel();
  process.exit(1);
});
