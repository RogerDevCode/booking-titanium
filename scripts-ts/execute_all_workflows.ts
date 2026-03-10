#!/usr/bin/env node
/**
 * =============================================================================
 * Execute All Workflows
 * =============================================================================
 * Purpose: Executes all workflows via webhooks for E2E testing
 *
 * Key features:
 *   - Executes workflows via webhook endpoints
 *   - Validates Standard Contract output
 *   - Validates node versions against SSOT before execution
 *   - Watchdog-protected (configurable timeout)
 *   - Generates coverage report
 *
 * Usage: npx tsx scripts-ts/execute_all_workflows.ts [--timeout 300] [--parallel 5]
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Watchdog, withWatchdog, WATCHDOG_TIMEOUT } from './watchdog';
import { N8NConfig, WORKFLOWS_DIR } from './config';

// Extended watchdog timeout for workflow execution (default: 5 minutes)
const EXECUTION_TIMEOUT = parseInt(process.env.EXECUTION_TIMEOUT || '300', 10);
const watchdog = new Watchdog(EXECUTION_TIMEOUT);
watchdog.start();

// Note: .env is loaded automatically by config.ts (N8NConfig constructor)

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

interface WorkflowExecutionResult {
  workflowName: string;
  workflowFile: string;
  webhookPath?: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  executionTime?: number;
  standardContractValid?: boolean;
  nodeVersionIssues?: NodeVersionIssue[];
}

interface NodeVersionIssue {
  nodeName: string;
  nodeType: string;
  currentVersion: number;
  latestVersion: number;
  available: boolean;
}

interface ExecutionReport {
  timestamp: string;
  totalWorkflows: number;
  executed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: WorkflowExecutionResult[];
  coveragePercentage: number;
}

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const log = {
  info: (msg: string) => console.log(`${COLORS.blue}[INFO]${COLORS.reset} ${msg}`),
  success: (msg: string) => console.log(`${COLORS.green}[SUCCESS]${COLORS.reset} ${msg}`),
  warning: (msg: string) => console.log(`${COLORS.yellow}[WARNING]${COLORS.reset} ${msg}`),
  error: (msg: string) => console.log(`${COLORS.red}[ERROR]${COLORS.reset} ${msg}`),
  fail: (msg: string) => console.log(`${COLORS.red}❌ ${msg}${COLORS.reset}`),
  pass: (msg: string) => console.log(`${COLORS.green}✓ ${msg}${COLORS.reset}`),
  header: (msg: string) => console.log(`\n${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}\n${msg}\n${COLORS.cyan}${'='.repeat(70)}${COLORS.reset}`),
  progress: (msg: string) => console.log(`${COLORS.gray}[PROGRESS]${COLORS.reset} ${msg}`),
};

let api: AxiosInstance;
let n8nBaseUrl: string;
let ssotData: SSOTData | null = null;
let parallelLimit = 5;

/**
 * Initialize API client
 */
function initApi() {
  const config = new N8NConfig();
  n8nBaseUrl = config.api_url.replace('/api/v1', '');
  
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
 * Extract webhook path from workflow
 */
function extractWebhookPath(workflow: any): string | null {
  const nodes = workflow.nodes || [];
  
  for (const node of nodes) {
    if (node.type === 'n8n-nodes-base.webhook') {
      const path = node.parameters?.path;
      if (path) {
        return path;
      }
    }
  }
  
  return null;
}

/**
 * Validate Standard Contract output
 */
function validateStandardContract(data: any): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (typeof data !== 'object' || data === null) {
    issues.push('Output is not an object');
    return { valid: false, issues };
  }
  
  // Check required fields
  if (typeof data.success !== 'boolean') {
    issues.push('Missing or invalid "success" field (boolean required)');
  }
  
  if (!('error_code' in data)) {
    issues.push('Missing "error_code" field');
  } else if (data.error_code !== null && typeof data.error_code !== 'string') {
    issues.push('"error_code" must be null or string');
  }
  
  if (!('error_message' in data)) {
    issues.push('Missing "error_message" field');
  } else if (data.error_message !== null && typeof data.error_message !== 'string') {
    issues.push('"error_message" must be null or string');
  }
  
  if (!('data' in data)) {
    issues.push('Missing "data" field');
  }
  
  if (!('_meta' in data)) {
    issues.push('Missing "_meta" field');
  } else if (typeof data._meta !== 'object') {
    issues.push('"_meta" must be an object');
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Execute single workflow via webhook
 */
async function executeWorkflow(
  workflow: any,
  workflowFile: string
): Promise<WorkflowExecutionResult> {
  const workflowName = workflow.name || 'Unknown';
  const webhookPath = extractWebhookPath(workflow);
  
  const result: WorkflowExecutionResult = {
    workflowName,
    workflowFile,
    webhookPath: webhookPath || undefined,
    success: false,
  };
  
  // Validate node versions first
  const nodeVersionIssues = validateNodeVersions(workflow);
  if (nodeVersionIssues.length > 0) {
    result.nodeVersionIssues = nodeVersionIssues;
    log.warning(`${workflowName} has ${nodeVersionIssues.length} node version issues`);
  }
  
  // Check if workflow has webhook
  if (!webhookPath) {
    result.error = 'No webhook found in workflow';
    log.warning(`${workflowName} - No webhook to execute`);
    return result;
  }
  
  // Execute via webhook
  const startTime = Date.now();
  const webhookUrl = `${n8nBaseUrl}/webhook/${webhookPath}`;
  
  try {
    log.progress(`Executing ${workflowName}...`);
    
    const response = await axios.post(
      webhookUrl,
      { test: true, timestamp: new Date().toISOString() },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
        validateStatus: () => true, // Accept any status code
      }
    );
    
    const executionTime = Date.now() - startTime;
    result.executionTime = executionTime;
    result.statusCode = response.status;
    
    // Check if response is successful
    if (response.status >= 200 && response.status < 300) {
      const data = response.data;
      
      // Validate Standard Contract
      const validation = validateStandardContract(data);
      result.standardContractValid = validation.valid;
      
      if (validation.valid && data.success === true) {
        result.success = true;
        log.pass(`${workflowName} - OK (${executionTime}ms)`);
      } else if (validation.valid && data.success === false) {
        // Workflow executed but returned error
        result.success = true; // Execution was successful, workflow logic returned error
        result.error = data.error_message || 'Workflow returned success: false';
        log.warning(`${workflowName} - Executed but returned error: ${result.error}`);
      } else {
        result.success = false;
        result.error = `Invalid Standard Contract: ${validation.issues.join(', ')}`;
        log.fail(`${workflowName} - Invalid Standard Contract`);
      }
    } else {
      result.success = false;
      result.error = `HTTP ${response.status}: ${response.statusText}`;
      log.fail(`${workflowName} - HTTP ${response.status}`);
    }
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    result.executionTime = executionTime;
    
    if (error.code === 'ECONNREFUSED') {
      result.error = 'Connection refused - n8n server not reachable';
      log.fail(`${workflowName} - Connection refused`);
    } else if (error.code === 'ETIMEDOUT') {
      result.error = 'Request timeout';
      log.fail(`${workflowName} - Timeout`);
    } else {
      result.error = error.message;
      log.fail(`${workflowName} - ${error.message}`);
    }
  }
  
  return result;
}

/**
 * Execute workflows with parallelism limit
 */
async function executeWorkflowsWithLimit(
  workflows: any[],
  limit: number
): Promise<WorkflowExecutionResult[]> {
  const results: WorkflowExecutionResult[] = [];
  const executing = new Set<Promise<void>>();
  
  for (const workflow of workflows) {
    const workflowFile = path.basename(workflow._file || '');
    
    const executionPromise = (async () => {
      const result = await executeWorkflow(workflow, workflowFile);
      results.push(result);
      executing.delete(executionPromise);
    })();
    
    executing.add(executionPromise);
    
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  
  // Wait for remaining executions
  await Promise.all(executing);
  
  return results;
}

/**
 * Generate execution report
 */
function generateReport(results: WorkflowExecutionResult[]): ExecutionReport {
  const executed = results.filter(r => r.webhookPath).length;
  const successful = results.filter(r => r.success && r.webhookPath).length;
  const failed = results.filter(r => !r.success && r.webhookPath).length;
  const skipped = results.filter(r => !r.webhookPath).length;
  
  const coveragePercentage = executed > 0 
    ? Math.round((successful / executed) * 100) 
    : 0;
  
  return {
    timestamp: new Date().toISOString(),
    totalWorkflows: results.length,
    executed,
    successful,
    failed,
    skipped,
    results,
    coveragePercentage,
  };
}

/**
 * Save report to file
 */
function saveReport(report: ExecutionReport, outputPath: string): void {
  const reportJson = JSON.stringify(report, null, 2);
  fs.writeFileSync(outputPath, reportJson);
  log.info(`Report saved to: ${outputPath}`);
}

/**
 * Main execution function
 */
async function executeAllWorkflows() {
  log.header('EXECUTE ALL WORKFLOWS');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const timeoutArg = args.find(a => a.startsWith('--timeout='));
  const parallelArg = args.find(a => a.startsWith('--parallel='));
  
  if (timeoutArg) {
    const timeout = parseInt(timeoutArg.split('=')[1], 10);
    if (timeout > 0) {
      watchdog.reset();
      log.info(`Timeout set to ${timeout}s`);
    }
  }
  
  if (parallelArg) {
    parallelLimit = parseInt(parallelArg.split('=')[1], 10) || 5;
  }
  
  log.info(`Parallel limit: ${parallelLimit}`);
  log.info(`Watchdog timeout: ${watchdog.getRemaining()}s remaining`);

  log.info('Initializing API client...');
  initApi();
  log.info(`n8n Base URL: ${n8nBaseUrl}`);

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

  // Load workflows
  log.info('Loading workflows...');
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

  if (workflows.length === 0) {
    log.error('No workflows found');
    watchdog.cancel();
    process.exit(1);
  }

  log.success(`Loaded ${workflows.length} workflows`);

  console.log('\n' + '-'.repeat(70));
  console.log('EXECUTING WORKFLOWS:');
  console.log('-'.repeat(70) + '\n');

  // Execute workflows
  const results = await executeWorkflowsWithLimit(workflows, parallelLimit);

  // Generate report
  const report = generateReport(results);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('EXECUTION SUMMARY:');
  console.log('='.repeat(70));
  console.log(`Total workflows: ${report.totalWorkflows}`);
  console.log(`${COLORS.green}✓ Executed: ${report.executed}${COLORS.reset}`);
  console.log(`${COLORS.green}  - Successful: ${report.successful}${COLORS.reset}`);
  console.log(`${COLORS.red}  - Failed: ${report.failed}${COLORS.reset}`);
  console.log(`${COLORS.yellow}⚠️  Skipped (no webhook): ${report.skipped}${COLORS.reset}`);
  console.log(`\nCoverage: ${COLORS.cyan}${report.coveragePercentage}%${COLORS.reset}`);

  // Save report
  const reportsDir = path.resolve(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `execution-report-${timestamp}.json`);
  saveReport(report, reportPath);

  // List failed workflows
  const failedResults = results.filter(r => !r.success && r.webhookPath);
  if (failedResults.length > 0) {
    console.log('\n' + '-'.repeat(70));
    console.log('FAILED EXECUTIONS:');
    console.log('-'.repeat(70) + '\n');
    
    for (const result of failedResults) {
      console.log(`${COLORS.red}✗ ${result.workflowName}${COLORS.reset}`);
      console.log(`  File: ${result.workflowFile}`);
      console.log(`  Error: ${result.error}`);
      if (result.nodeVersionIssues && result.nodeVersionIssues.length > 0) {
        console.log(`  Node issues: ${result.nodeVersionIssues.length}`);
      }
      console.log('');
    }
  }

  // Cancel watchdog on successful completion
  watchdog.cancel();
  
  console.log('='.repeat(70));
  log.success('Workflow execution complete!');
  console.log('='.repeat(70) + '\n');
  
  // Exit with error code if failures
  if (report.failed > 0) {
    process.exit(1);
  }
}

// Run main function
executeAllWorkflows().catch(error => {
  log.error(`Script failed: ${error.message}`);
  console.error(error);
  watchdog.cancel();
  process.exit(1);
});
