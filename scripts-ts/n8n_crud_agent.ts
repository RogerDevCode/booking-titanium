#!/usr/bin/env tsx
/**
 * N8N CRUD Agent - Performs Create, Read, Update, Delete operations on n8n workflows
 *
 * @migration-source scripts-py/n8n_crud_agent.py
 * @migration-date 2026-03-08
 * @migration-tool Qwen Code
 *
 * WATCHDOG: This script has a 3-minute timeout (180 seconds)
 * If execution exceeds this limit, the process will be killed with exit code 3
 *
 * FEATURES:
 * - 100% self-contained (no external dependencies within project)
 * - CLI argument parsing with --help (no API key required)
 * - workflow_activation_order.json synchronization
 * - Retry logic with exponential backoff
 * - Verbose/debug logging options
 * - Standard Contract pattern for outputs
 *
 * USAGE:
 *   npx tsx scripts-ts/n8n_crud_agent.ts --help
 *   npx tsx scripts-ts/n8n_crud_agent.ts --list
 *   npx tsx scripts-ts/n8n_crud_agent.ts --get <workflow-id>
 *   npx tsx scripts-ts/n8n_crud_agent.ts --create <file.json>
 *   npx tsx scripts-ts/n8n_crud_agent.ts --update <id> <file.json>
 *   npx tsx scripts-ts/n8n_crud_agent.ts --delete <id>
 *   npx tsx scripts-ts/n8n_crud_agent.ts --activate-wf <id>
 *   npx tsx scripts-ts/n8n_crud_agent.ts --deactivate <id>
 *   npx tsx scripts-ts/n8n_crud_agent.ts --execute <id>
 *   npx tsx scripts-ts/n8n_crud_agent.ts --executions <id> [limit]
 *
 * ENVIRONMENT VARIABLES:
 *   N8N_API_URL       - n8n instance URL (default: https://n8n.stax.ink)
 *   N8N_API_KEY       - API key for authentication
 *   N8N_ACCESS_TOKEN  - Alternative API key (for /rest/* endpoints)
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

const WATCHDOG_TIMEOUT = 180; // 3 minutes
const DEFAULT_N8N_URL = 'https://n8n.stax.ink';
const ACTIVATION_ORDER_FILE = 'workflow_activation_order.json';

// ============================================================================
// WATCHDOG IMPLEMENTATION (Self-contained)
// ============================================================================

class Watchdog {
  private timer: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();

  constructor(private seconds: number = WATCHDOG_TIMEOUT) {
    if (seconds <= 0) {
      console.warn('Watchdog: seconds must be > 0, watchdog disabled');
    }
  }

  start(): void {
    if (this.seconds <= 0) {
      return;
    }

    this.startTime = Date.now();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const remaining = this.seconds - elapsed;

    console.warn(`⏱️  Watchdog armed: ${this.seconds}s timeout — process will die if stuck longer`);

    this.timer = setTimeout(() => {
      const actualElapsed = Math.floor((Date.now() - this.startTime) / 1000);
      console.error(`\n❌ WATCHDOG FIRED after ${actualElapsed}s — process was stuck, killing.`);
      console.error(`   Timeout: ${this.seconds}s (3 minutes max)`);
      console.error(`   Exit code: 3`);
      process.exit(3);
    }, this.seconds * 1000);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      console.warn(`✓ Watchdog cancelled after ${elapsed}s`);
    }
  }

  reset(): void {
    this.cancel();
    this.start();
  }

  getElapsed(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getRemaining(): number {
    const elapsed = this.getElapsed();
    return Math.max(0, this.seconds - elapsed);
  }
}

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

// ============================================================================
// LOGGER IMPLEMENTATION (Self-contained)
// ============================================================================

class Logger {
  private verboseEnabled: boolean;
  private debugEnabled: boolean;

  constructor(verbose: boolean = false, debug: boolean = false) {
    this.verboseEnabled = verbose;
    this.debugEnabled = debug;
  }

  info(message: string): void {
    console.log(message);
  }

  verbose(message: string): void {
    if (this.verboseEnabled || this.debugEnabled) {
      console.log(`[VERBOSE] ${message}`);
    }
  }

  debug(message: string): void {
    if (this.debugEnabled) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  error(message: string): void {
    console.error(`[ERROR] ${message}`);
  }

  success(message: string): void {
    console.log(`✓ ${message}`);
  }

  warning(message: string): void {
    console.warn(`⚠ ${message}`);
  }
}

// ============================================================================
// TYPE INTERFACES
// ============================================================================

interface StandardContractOutput {
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  data: any | null;
  _meta?: {
    source: string;
    timestamp: string;
    workflow_id?: string;
    version?: string;
  };
}

interface WorkflowActivationEntry {
  name: string;
  id: string;
  order: number;
  webhook_path?: string;
  description?: string;
  production_url?: string;
}

interface WorkflowData {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
  active?: boolean;
  id?: string;
  tags?: any[];
  triggerCount?: number;
  updatedAt?: string;
  updatedBy?: string;
  createdAt?: string;
  [key: string]: any;
}

interface WorkflowNode {
  parameters: Record<string, any>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  [key: string]: any;
}

interface ExecutionData {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  mode: string;
  workflowId?: string;
  finished?: boolean;
  data?: any;
  [key: string]: any;
}

interface CliArgs {
  operation: string;
  workflowId?: string;
  workflowName?: string;
  file?: string;
  activate?: boolean;
  limit?: number;
  verbose?: boolean;
  debug?: boolean;
  sync?: boolean;
  help?: boolean;
}

// ============================================================================
// N8N CRUD AGENT CLASS
// ============================================================================

export class N8NCrudAgent {
  private apiUrl: string;
  private apiKey: string;
  private client: AxiosInstance;
  private logger: Logger;
  private activationOrderPath: string;

  constructor(
    api_url?: string,
    api_key?: string,
    verbose: boolean = false,
    debug: boolean = false
  ) {
    this.logger = new Logger(verbose, debug);

    // Load .env file (try multiple locations)
    const possiblePaths = [
      path.join(__dirname, '.env'),           // scripts-ts/.env
      path.join(__dirname, '..', '.env'),     // project-root/.env
      path.resolve(process.cwd(), '.env'),    // cwd/.env
    ];

    for (const envPath of possiblePaths) {
      if (fs.existsSync(envPath)) {
        const envConfig = dotenv.config({ path: envPath, override: true });
        if (envConfig.parsed) {
          for (const [key, value] of Object.entries(envConfig.parsed)) {
            process.env[key] = value;
          }
        }
        this.logger.debug(`Loaded .env from: ${envPath}`);
        break;
      }
    }

    // API URL: parameter > env var > default
    this.apiUrl = (api_url ?? process.env.N8N_API_URL ?? DEFAULT_N8N_URL).replace(/\/$/, '');
    if (this.apiUrl.endsWith('/api/v1')) {
      this.apiUrl = this.apiUrl.slice(0, -7);
    }

    // API Key: parameter > X_N8N_API_KEY > N8N_API_KEY > N8N_ACCESS_TOKEN
    this.apiKey = api_key ?? 
                  process.env.X_N8N_API_KEY ?? 
                  process.env.N8N_API_KEY ?? 
                  process.env.N8N_ACCESS_TOKEN ?? 
                  '';

    // Don't validate API key in constructor (needed for --help to work without key)
    // Validation happens in run() method after --help check

    // Create axios instance with proper headers
    // IMPORTANT: n8n cloud requires X-N8N-API-KEY header for ALL API keys (even JWTs)
    // Bearer auth is only for specific /rest/* endpoints with ACCESS_TOKEN
    const apiBase = `${this.apiUrl}/api/v1`;

    this.client = axios.create({
      baseURL: apiBase,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': this.apiKey,  // Always use X-N8N-API-KEY for /api/v1/*
      },
      timeout: 30000,
      validateStatus: (status) => status < 500,
    });

    // Activation order file path
    this.activationOrderPath = path.join(__dirname, ACTIVATION_ORDER_FILE);

    this.logger.verbose(`Initialized N8NCrudAgent with URL: ${this.apiUrl}`);
  }

  // ============================================================================
  // CLI ARGUMENT PARSING
  // ============================================================================

  private parseArgs(): CliArgs {
    const args: CliArgs = {
      operation: 'list',
      verbose: false,
      debug: false,
      sync: false,
      help: false,
    };

    const argv = process.argv.slice(2);

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];

      switch (arg) {
        case '--help':
        case '-h':
          args.help = true;
          break;
        case '--verbose':
        case '-v':
          args.verbose = true;
          break;
        case '--debug':
          args.debug = true;
          break;
        case '--sync':
          args.sync = true;
          break;
        case '--activate':
          args.activate = true;
          break;
        case '--list':
          args.operation = 'list';
          break;
        case '--list-active':
          args.operation = 'list-active';
          break;
        case '--get':
          args.operation = 'get';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          break;
        case '--create':
        case '--push':
          args.operation = 'create';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.file = argv[++i];
          }
          break;
        case '--update':
          args.operation = 'update';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          if (argv[i + 1] && argv[i + 1].endsWith('.json')) {
            args.file = argv[++i];
          }
          break;
        case '--delete':
          args.operation = 'delete';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          break;
        case '--activate-wf':
          args.operation = 'activate';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          break;
        case '--deactivate':
          args.operation = 'deactivate';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          break;
        case '--execute':
          args.operation = 'execute';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          break;
        case '--executions':
          args.operation = 'executions';
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          if (argv[i + 1] && !isNaN(Number(argv[i + 1]))) {
            args.limit = Number(argv[++i]);
          }
          break;
        case '--id':
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowId = argv[++i];
          }
          break;
        case '--name':
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args.workflowName = argv[++i];
          }
          break;
        case '--file':
          if (argv[i + 1] && argv[i + 1].endsWith('.json')) {
            args.file = argv[++i];
          }
          break;
        case '--limit':
          if (argv[i + 1] && !isNaN(Number(argv[i + 1]))) {
            args.limit = Number(argv[++i]);
          }
          break;
        case '--url':
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            process.env.N8N_API_URL = argv[++i];
          }
          break;
        case '--api-key':
          if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            process.env.N8N_API_KEY = argv[++i];
          }
          break;
        default:
          if (!args.workflowId && !arg.startsWith('--')) {
            args.workflowId = arg;
          }
          break;
      }
    }

    return args;
  }

  // ============================================================================
  // HELP MESSAGE
  // ============================================================================

  private showHelp(): void {
    console.log(`
N8N CRUD Agent - Workflow Management Tool

USAGE:
  npx tsx scripts-ts/n8n_crud_agent.ts [operation] [options]

OPERATIONS:
  --list, --list-active       List workflows (all or active only)
  --get <id>                  Get workflow by ID
  --create, --push <file>     Create workflow from JSON file
  --update <id> <file>        Update workflow from JSON file
  --delete <id>               Delete workflow by ID
  --activate-wf <id>          Activate (publish) workflow
  --deactivate <id>           Deactivate (unpublish) workflow
  --execute <id>              Execute workflow manually
  --executions <id> [limit]   Get executions for workflow

OPTIONS:
  --id <id>                   Workflow ID
  --name <name>               Workflow name
  --file <file>               JSON file path
  --activate                  Activate after create/update
  --sync                      Sync with workflow_activation_order.json
  --limit <n>                 Limit results (default: 10)
  --verbose, -v               Verbose output
  --debug                     Debug output (includes verbose)
  --url <url>                 Override N8N_API_URL
  --api-key <key>             Override N8N_API_KEY
  --help, -h                  Show this help message

EXAMPLES:
  # List all workflows
  npx tsx scripts-ts/n8n_crud_agent.ts --list

  # Get workflow by ID
  npx tsx scripts-ts/n8n_crud_agent.ts --get PTJmDjgXfi14rdRW

  # Create workflow from file
  npx tsx scripts-ts/n8n_crud_agent.ts --create workflows/NN_03_AI_Agent.json

  # Update workflow and activate
  npx tsx scripts-ts/n8n_crud_agent.ts --update PTJmDjgXfi14rdRW workflows/NN_03_AI_Agent.json --activate

  # Delete workflow
  npx tsx scripts-ts/n8n_crud_agent.ts --delete PTJmDjgXfi14rdRW

  # Get last 25 executions
  npx tsx scripts-ts/n8n_crud_agent.ts --executions PTJmDjgXfi14rdRW 25

ENVIRONMENT VARIABLES:
  N8N_API_URL                 n8n instance URL (default: https://n8n.stax.ink)
  X_N8N_API_KEY               API key (recommended, works with /api/v1/*)
  N8N_API_KEY                 Alternative API key
  N8N_ACCESS_TOKEN            JWT token (for /rest/* endpoints)
`);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    operation: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on 4xx errors (client errors)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          this.logger.verbose(
            `${operation} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Unknown error');
  }

  private loadActivationOrder(): WorkflowActivationEntry[] {
    if (!fs.existsSync(this.activationOrderPath)) {
      this.logger.verbose('workflow_activation_order.json not found, creating empty array');
      return [];
    }

    const content = fs.readFileSync(this.activationOrderPath, 'utf-8');
    return JSON.parse(content);
  }

  private saveActivationOrder(entries: WorkflowActivationEntry[]): void {
    const json = JSON.stringify(entries, null, 2);
    fs.writeFileSync(this.activationOrderPath, json, 'utf-8');
    this.logger.verbose('workflow_activation_order.json updated');
  }

  private syncWithActivationOrder(
    workflow: WorkflowData,
    operation: 'add' | 'update' | 'remove'
  ): void {
    if (!workflow.id) {
      this.logger.warning('Cannot sync: workflow has no ID');
      return;
    }

    const entries = this.loadActivationOrder();

    switch (operation) {
      case 'add':
      case 'update': {
        const existingIndex = entries.findIndex((e) => e.id === workflow.id);
        const newEntry: WorkflowActivationEntry = {
          name: workflow.name,
          id: workflow.id,
          order: existingIndex >= 0 ? entries[existingIndex].order : entries.length + 1,
        };

        const webhookNode = workflow.nodes.find(
          (n) => n.type === 'n8n-nodes-base.webhook'
        );
        if (webhookNode?.parameters?.path) {
          newEntry.webhook_path = webhookNode.parameters.path;
        }

        if (existingIndex >= 0) {
          entries[existingIndex] = { ...entries[existingIndex], ...newEntry };
          this.logger.verbose(`Updated activation order entry for ${workflow.name}`);
        } else {
          entries.push(newEntry);
          this.logger.verbose(`Added activation order entry for ${workflow.name}`);
        }
        break;
      }

      case 'remove': {
        const filtered = entries.filter((e) => e.id !== workflow.id);
        if (filtered.length < entries.length) {
          entries.length = 0;
          entries.push(...filtered);
          this.logger.verbose(`Removed activation order entry for ${workflow.name}`);
        }
        break;
      }
    }

    this.saveActivationOrder(entries);
  }

  private createOutput(
    success: boolean,
    data: any = null,
    error_code: string | null = null,
    error_message: string | null = null,
    workflow_id?: string
  ): StandardContractOutput {
    return {
      success,
      error_code,
      error_message,
      data,
      _meta: {
        source: 'n8n_crud_agent',
        timestamp: new Date().toISOString(),
        workflow_id,
        version: '2.0.0',
      },
    };
  }

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  async listWorkflows(): Promise<WorkflowData[] | StandardContractOutput> {
    try {
      this.logger.verbose('Listing all workflows...');

      const response: AxiosResponse<{ data: WorkflowData[] }> =
        await this.withRetry(
          () => this.client.get('/workflows'),
          3,
          'listWorkflows'
        );

      if (response.status === 200) {
        this.logger.success(`Found ${response.data.data.length} workflow(s)`);
        return response.data.data;
      } else {
        const errorMsg = `Error retrieving workflows: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'LIST_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async listActiveWorkflows(): Promise<WorkflowData[] | StandardContractOutput> {
    try {
      this.logger.verbose('Listing active workflows...');

      const response: AxiosResponse<{ data: WorkflowData[] }> =
        await this.withRetry(
          () => this.client.get('/workflows'),
          3,
          'listActiveWorkflows'
        );

      if (response.status === 200) {
        const workflows = response.data.data.filter((wf) => wf.active === true);
        this.logger.success(`Found ${workflows.length} active workflow(s)`);
        return workflows;
      } else {
        const errorMsg = `Error retrieving workflows: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'LIST_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async getWorkflowById(workflow_id: string): Promise<WorkflowData | StandardContractOutput> {
    try {
      this.logger.verbose(`Getting workflow ${workflow_id}...`);

      const response: AxiosResponse<WorkflowData> = await this.withRetry(
        () => this.client.get(`/workflows/${workflow_id}`),
        3,
        `getWorkflowById(${workflow_id})`
      );

      if (response.status === 200) {
        this.logger.success(`Retrieved workflow: ${response.data.name}`);
        return response.data;
      } else if (response.status === 404) {
        const errorMsg = `Workflow ${workflow_id} not found`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'NOT_FOUND', errorMsg);
      } else {
        const errorMsg = `Error retrieving workflow ${workflow_id}: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'GET_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async createWorkflow(
    workflow_data: WorkflowData,
    activate: boolean = false
  ): Promise<WorkflowData | StandardContractOutput> {
    try {
      this.logger.verbose(`Creating workflow: ${workflow_data.name}...`);

      const response: AxiosResponse<WorkflowData> = await this.withRetry(
        () => this.client.post('/workflows', workflow_data),
        3,
        `createWorkflow(${workflow_data.name})`
      );

      if (response.status === 200 || response.status === 201) {
        const created = response.data;
        this.logger.success(`Created workflow: ${created.name} (ID: ${created.id})`);

        this.syncWithActivationOrder(created, 'add');

        if (activate && created.id) {
          this.logger.verbose('Activating workflow...');
          await this.activateWorkflow(created.id);
        }

        return created;
      } else {
        const errorMsg = `Error creating workflow: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'CREATE_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async updateWorkflow(
    workflow_id: string,
    workflow_data: WorkflowData,
    activate: boolean = false
  ): Promise<WorkflowData | StandardContractOutput> {
    try {
      this.logger.verbose(`Updating workflow ${workflow_id}...`);

      const response: AxiosResponse<WorkflowData> = await this.withRetry(
        () => this.client.put(`/workflows/${workflow_id}`, workflow_data),
        3,
        `updateWorkflow(${workflow_id})`
      );

      if (response.status === 200) {
        const updated = response.data;
        this.logger.success(`Updated workflow: ${updated.name}`);

        this.syncWithActivationOrder(updated, 'update');

        if (activate) {
          this.logger.verbose('Activating workflow...');
          await this.activateWorkflow(workflow_id);
        }

        return updated;
      } else if (response.status === 404) {
        const errorMsg = `Workflow ${workflow_id} not found`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'NOT_FOUND', errorMsg);
      } else {
        const errorMsg = `Error updating workflow ${workflow_id}: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'UPDATE_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async deleteWorkflow(workflow_id: string): Promise<StandardContractOutput> {
    try {
      this.logger.verbose(`Deleting workflow ${workflow_id}...`);

      const workflow = await this.getWorkflowById(workflow_id);
      if (workflow && 'error_code' in workflow) {
        return workflow;
      }

      const response: AxiosResponse = await this.withRetry(
        () => this.client.delete(`/workflows/${workflow_id}`),
        3,
        `deleteWorkflow(${workflow_id})`
      );

      if (response.status === 200) {
        this.logger.success(`Deleted workflow ${workflow_id}`);

        if (workflow && 'id' in workflow) {
          this.syncWithActivationOrder(workflow, 'remove');
        }

        return this.createOutput(true, null, null, null, workflow_id);
      } else if (response.status === 404) {
        const errorMsg = `Workflow ${workflow_id} not found`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'NOT_FOUND', errorMsg);
      } else {
        const errorMsg = `Error deleting workflow ${workflow_id}: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'DELETE_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async activateWorkflow(workflow_id: string): Promise<StandardContractOutput> {
    try {
      this.logger.verbose(`Activating workflow ${workflow_id}...`);

      const response: AxiosResponse = await this.withRetry(
        () => this.client.post(`/workflows/${workflow_id}/activate`),
        3,
        `activateWorkflow(${workflow_id})`
      );

      if (response.status === 200) {
        this.logger.success(`Activated workflow ${workflow_id}`);
        return this.createOutput(true, null, null, null, workflow_id);
      } else if (response.status === 400) {
        const errorData = response.data as any;
        const errorMsg = `Error activating workflow: ${errorData?.message || response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'ACTIVATION_FAILED', errorMsg);
      } else {
        const errorMsg = `Error activating workflow ${workflow_id}: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'ACTIVATION_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async deactivateWorkflow(workflow_id: string): Promise<StandardContractOutput> {
    try {
      this.logger.verbose(`Deactivating workflow ${workflow_id}...`);

      const response: AxiosResponse = await this.withRetry(
        () => this.client.post(`/workflows/${workflow_id}/deactivate`),
        3,
        `deactivateWorkflow(${workflow_id})`
      );

      if (response.status === 200) {
        this.logger.success(`Deactivated workflow ${workflow_id}`);
        return this.createOutput(true, null, null, null, workflow_id);
      } else {
        const errorMsg = `Error deactivating workflow ${workflow_id}: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'DEACTIVATION_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async executeWorkflow(workflow_id: string): Promise<Record<string, any> | StandardContractOutput> {
    try {
      this.logger.verbose(`Executing workflow ${workflow_id}...`);

      const response: AxiosResponse<Record<string, any>> = await this.withRetry(
        () => this.client.post(`/workflows/${workflow_id}/run`),
        3,
        `executeWorkflow(${workflow_id})`
      );

      if (response.status === 200) {
        this.logger.success(`Executed workflow ${workflow_id}`);
        return response.data;
      } else {
        const errorMsg = `Error executing workflow ${workflow_id}: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'EXECUTION_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async getExecutions(
    workflow_id?: string,
    limit: number = 10
  ): Promise<ExecutionData[] | StandardContractOutput> {
    try {
      this.logger.verbose(`Getting executions (limit: ${limit})...`);

      let url: string;
      if (workflow_id) {
        url = `/executions?filter=${JSON.stringify({ workflowId: workflow_id })}&limit=${limit}`;
      } else {
        url = `/executions?limit=${limit}`;
      }

      const response: AxiosResponse<{ data: ExecutionData[] }> =
        await this.withRetry(() => this.client.get(url), 3, 'getExecutions');

      if (response.status === 200) {
        this.logger.success(`Retrieved ${response.data.data.length} execution(s)`);
        return response.data.data;
      } else {
        const errorMsg = `Error retrieving executions: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'EXECUTIONS_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  async getExecutionById(execution_id: string): Promise<ExecutionData | StandardContractOutput> {
    try {
      this.logger.verbose(`Getting execution ${execution_id}...`);

      const response: AxiosResponse<ExecutionData> = await this.withRetry(
        () => this.client.get(`/executions/${execution_id}`),
        3,
        `getExecutionById(${execution_id})`
      );

      if (response.status === 200) {
        this.logger.success(`Retrieved execution ${execution_id}`);
        return response.data;
      } else if (response.status === 404) {
        const errorMsg = `Execution ${execution_id} not found`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'NOT_FOUND', errorMsg);
      } else {
        const errorMsg = `Error retrieving execution ${execution_id}: ${response.status} - ${response.statusText}`;
        this.logger.error(errorMsg);
        return this.createOutput(false, null, 'EXECUTION_GET_FAILED', errorMsg);
      }
    } catch (error: any) {
      const errorMsg = `Error connecting to n8n: ${error.message}`;
      this.logger.error(errorMsg);
      return this.createOutput(false, null, 'CONNECTION_ERROR', errorMsg);
    }
  }

  loadWorkflowFromFile(file_path: string): WorkflowData | null {
    try {
      const resolvedPath = path.resolve(file_path);

      if (!fs.existsSync(resolvedPath)) {
        this.logger.error(`File not found: ${resolvedPath}`);
        return null;
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const workflow = JSON.parse(content);

      this.logger.verbose(`Loaded workflow from: ${resolvedPath}`);
      return workflow;
    } catch (error: any) {
      this.logger.error(`Error loading workflow file: ${error.message}`);
      return null;
    }
  }

  // ============================================================================
  // MAIN CLI HANDLER
  // ============================================================================

  async run(): Promise<number> {
    const args = this.parseArgs();

    // Handle --help FIRST (before API key validation)
    if (args.help) {
      this.showHelp();
      watchdog.cancel();
      return 0;
    }

    // Update logger verbosity based on parsed args
    this.logger = new Logger(args.verbose ?? false, args.debug ?? false);

    // Validate API key (only after --help check)
    if (!this.apiKey || this.apiKey.trim() === '') {
      this.logger.error('N8N API Key not found.');
      this.logger.error('Set one of these environment variables in .env:');
      this.logger.error('  - X_N8N_API_KEY (recommended for n8n cloud)');
      this.logger.error('  - N8N_API_KEY (alternative)');
      this.logger.error('  - N8N_ACCESS_TOKEN (JWT token for /rest/* endpoints)');
      this.logger.error('Or use --api-key <key> option');
      watchdog.cancel();
      return 1;
    }

    this.logger.info(`\nN8N CRUD Agent - Operation: ${args.operation}`);
    this.logger.verbose(`Connected to: ${this.apiUrl}`);

    let result: any;

    try {
      switch (args.operation) {
        case 'list':
          result = await this.listWorkflows();
          if (Array.isArray(result)) {
            console.log('\n--- Workflows ---');
            for (const wf of result) {
              const status = wf.active ? 'ACTIVE' : 'INACTIVE';
              console.log(`  [${status}] ${wf.id} | ${wf.name}`);
            }
          } else {
            console.log('Error:', result);
            return 1;
          }
          break;

        case 'list-active':
          result = await this.listActiveWorkflows();
          if (Array.isArray(result)) {
            console.log('\n--- Active Workflows ---');
            for (const wf of result) {
              console.log(`  ${wf.id} | ${wf.name}`);
            }
          } else {
            console.log('Error:', result);
            return 1;
          }
          break;

        case 'get':
          if (!args.workflowId) {
            this.logger.error('Workflow ID required. Use --get <id>');
            return 1;
          }
          result = await this.getWorkflowById(args.workflowId);
          if (result && 'error_code' in result) {
            console.log('Error:', result);
            return 1;
          }
          console.log('\n--- Workflow Details ---');
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'create':
          if (!args.file) {
            this.logger.error('File path required. Use --create <file.json>');
            return 1;
          }
          const createWorkflow = this.loadWorkflowFromFile(args.file);
          if (!createWorkflow) {
            return 1;
          }
          result = await this.createWorkflow(createWorkflow, args.activate);
          if (result && 'error_code' in result && !result.success) {
            console.log('Error:', result);
            return 1;
          }
          console.log('\n--- Created Workflow ---');
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'update':
          if (!args.workflowId || !args.file) {
            this.logger.error('Workflow ID and file required. Use --update <id> <file.json>');
            return 1;
          }
          const updateWorkflow = this.loadWorkflowFromFile(args.file);
          if (!updateWorkflow) {
            return 1;
          }
          result = await this.updateWorkflow(args.workflowId, updateWorkflow, args.activate);
          if (result && 'error_code' in result && !result.success) {
            console.log('Error:', result);
            return 1;
          }
          console.log('\n--- Updated Workflow ---');
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'delete':
          if (!args.workflowId) {
            this.logger.error('Workflow ID required. Use --delete <id>');
            return 1;
          }
          result = await this.deleteWorkflow(args.workflowId);
          if (!result.success) {
            console.log('Error:', result);
            return 1;
          }
          console.log('Workflow deleted successfully');
          break;

        case 'activate':
          if (!args.workflowId) {
            this.logger.error('Workflow ID required. Use --activate-wf <id>');
            return 1;
          }
          result = await this.activateWorkflow(args.workflowId);
          if (!result.success) {
            console.log('Error:', result);
            return 1;
          }
          console.log('Workflow activated successfully');
          break;

        case 'deactivate':
          if (!args.workflowId) {
            this.logger.error('Workflow ID required. Use --deactivate <id>');
            return 1;
          }
          result = await this.deactivateWorkflow(args.workflowId);
          if (!result.success) {
            console.log('Error:', result);
            return 1;
          }
          console.log('Workflow deactivated successfully');
          break;

        case 'execute':
          if (!args.workflowId) {
            this.logger.error('Workflow ID required. Use --execute <id>');
            return 1;
          }
          result = await this.executeWorkflow(args.workflowId);
          if (result && 'error_code' in result && !result.success) {
            console.log('Error:', result);
            return 1;
          }
          console.log('\n--- Execution Result ---');
          console.log(JSON.stringify(result, null, 2));
          break;

        case 'executions':
          result = await this.getExecutions(args.workflowId, args.limit || 10);
          if (Array.isArray(result)) {
            console.log('\n--- Executions ---');
            for (const exec of result) {
              const status = exec.finished ? 'DONE' : exec.status;
              console.log(`  [${status}] ${exec.id} | ${exec.startedAt}`);
            }
          } else {
            console.log('Error:', result);
            return 1;
          }
          break;

        default:
          this.logger.error(`Unknown operation: ${args.operation}`);
          this.showHelp();
          return 1;
      }

      watchdog.cancel();
      return 0;
    } catch (error: any) {
      this.logger.error(`Fatal error: ${error.message}`);
      watchdog.cancel();
      return 1;
    }
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

if (require.main === module) {
  (async () => {
    const agent = new N8NCrudAgent(
      undefined,
      undefined,
      process.argv.includes('--verbose') || process.argv.includes('-v'),
      process.argv.includes('--debug')
    );

    const exitCode = await agent.run();
    process.exit(exitCode);
  })().catch((error) => {
    console.error('Fatal error:', error.message);
    watchdog.cancel();
    process.exit(1);
  });
}
