#!/usr/bin/env tsx
/**
 * n8n_pull_v2.ts - Download N8N Workflows from Server to Local
 * ================================================================================
 *
 * 100% Native TypeScript - NO external dependencies
 *
 * FEATURES:
 * - Download workflow by name or ID
 * - Download all workflows
 * - Download only seed workflows (WF1-WF7)
 * - Auto-update workflow_activation_order.json
 * - Preserve credentials references
 *
 * USAGE:
 *   npx tsx n8n_pull_v2.ts --help
 *   npx tsx n8n_pull_v2.ts --name WF1_Booking_API_Gateway --output workflows/seed/
 *   npx tsx n8n_pull_v2.ts --all --output workflows/seed/
 *   npx tsx n8n_pull_v2.ts --seed --output workflows/seed/
 *
 * OPTIONS:
 *   --name, -n        Workflow name to download
 *   --id, -i          Workflow ID to download
 *   --all             Download all workflows
 *   --seed            Download only seed workflows (WF1-WF7)
 *   --output, -o      Output directory (default: workflows/seed/)
 *   --url             Override N8N_API_URL
 *   --api-key         Override N8N_API_KEY
 *   --help, -h        Show help message
 */

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "util";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import * as dotenv from "dotenv";

// Load .env from project root
const possibleEnvPaths = [
  path.join(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  dotenv.config();
}

// Terminal colors
const C = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  RED: "\x1b[91m",
  GREEN: "\x1b[92m",
  YELLOW: "\x1b[93m",
  CYAN: "\x1b[96m",
  GREY: "\x1b[90m",
  WHITE: "\x1b[97m",
};

const log = {
  ok:   (msg: string) => console.log(`${C.GREEN}✅ ${msg}${C.RESET}`),
  err:  (msg: string) => console.error(`${C.RED}❌ ${msg}${C.RESET}`),
  warn: (msg: string) => console.warn(`${C.YELLOW}⚠️  ${msg}${C.RESET}`),
  info: (msg: string) => console.log(`${C.CYAN}ℹ  ${msg}${C.RESET}`),
  dim:  (msg: string) => console.log(`${C.GREY}${msg}${C.RESET}`),
};

// Config
function loadConfig(options: { url?: string; apiKey?: string }) {
  const apiUrl = options.url ||
                 process.env.N8N_API_URL ||
                 process.env.N8N_HOST ||
                 'https://n8n.stax.ink';

  const apiKey = options.apiKey ||
                 process.env.X_N8N_API_KEY ||
                 process.env.N8N_API_KEY ||
                 process.env.N8N_ACCESS_TOKEN;

  if (!apiUrl)
    throw new Error(
      "N8N API URL is not set. Use --url or set N8N_API_URL/N8N_HOST in .env",
    );

  if (!apiKey)
    throw new Error(
      "N8N API Key is not set. Use one of:\n" +
      "  - --api-key <key> option\n" +
      "  - X_N8N_API_KEY environment variable (recommended)\n" +
      "  - N8N_API_KEY environment variable\n" +
      "  - N8N_ACCESS_TOKEN environment variable"
    );

  const baseUrl = apiUrl.replace(/\/$/, "") + "/api/v1";

  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": apiKey,
    },
    timeout: 50000,
    validateStatus: () => true,
  });

  return { client, baseUrl };
}

// Retry wrapper
async function retryableRequest(
  requestFn: () => Promise<AxiosResponse>,
  maxRetries: number = 3,
): Promise<AxiosResponse> {
  let delay = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await requestFn();
      if (response.status >= 500) {
        if (attempt === maxRetries) return response;
        log.warn(
          `Server error ${response.status}. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 20000);
        continue;
      }
      return response;
    } catch (error: any) {
      const isNetworkError = !error.response;
      if (isNetworkError && attempt < maxRetries) {
        log.warn(
          `Network error. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 20000);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Unreachable");
}

// Fetch all workflows
async function fetchAllWorkflows(client: AxiosInstance): Promise<any[]> {
  const response = await retryableRequest(() => client.get("/workflows"));
  
  if (response.status === 401 || response.status === 403) {
    log.err(`Authentication failed (HTTP ${response.status})`);
    throw new Error(`Authentication failed: HTTP ${response.status}`);
  }

  if (response.status >= 400) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  return response.data.data || [];
}

// Get workflow by ID
async function getWorkflowById(client: AxiosInstance, id: string): Promise<any> {
  const response = await retryableRequest(() => client.get(`/workflows/${id}`));
  
  if (response.status === 404) {
    throw new Error(`Workflow with ID '${id}' not found`);
  }

  if (response.status >= 400) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  return response.data;
}

// Get workflow by name
async function getWorkflowByName(client: AxiosInstance, name: string): Promise<any> {
  const workflows = await fetchAllWorkflows(client);
  const matches = workflows.filter(wf => wf.name === name);
  
  if (matches.length === 0) {
    throw new Error(`Workflow with name '${name}' not found`);
  }
  
  if (matches.length > 1) {
    log.warn(`Multiple workflows found with name '${name}', using most recent`);
  }
  
  // Return most recently updated
  return matches.sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime(),
  )[0];
}

// Sanitize workflow for local storage (remove server-specific fields)
function sanitizeForLocal(data: any): any {
  const cleaned: any = {
    name: data.name,
    nodes: data.nodes || [],
    connections: data.connections || {},
    settings: data.settings || { executionOrder: "v1" },
    active: data.active || false,
  };
  
  // Keep versionId for tracking
  if (data.versionId) {
    cleaned.versionId = data.versionId;
  }
  
  // Strip server-specific fields from nodes
  const STRIP_FIELDS = [
    "id", "createdAt", "updatedAt", "staticData",
    "pinData", "meta", "tags",
  ];
  
  for (const node of cleaned.nodes) {
    for (const field of STRIP_FIELDS) {
      delete node[field];
    }
  }
  
  return cleaned;
}

// Save workflow to file
function saveWorkflowToFile(workflow: any, outputDir: string, filename?: string): string {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    log.info(`Created output directory: ${outputDir}`);
  }
  
  // Generate filename from workflow name if not provided
  if (!filename) {
    // Convert workflow name to filename (e.g., "WF1_Booking_API_Gateway" → "wf1_booking_api_gateway.json")
    const baseName = workflow.name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_');
    filename = `${baseName}.json`;
  }
  
  const filePath = path.join(outputDir, filename);
  const jsonContent = JSON.stringify(workflow, null, 2) + "\n";
  
  fs.writeFileSync(filePath, jsonContent, "utf-8");
  return filePath;
}

// Update workflow_activation_order.json
async function updateWorkflowIdsJson(workflows: any[], workflowIdsPath: string): Promise<boolean> {
  if (!fs.existsSync(workflowIdsPath)) {
    log.warn("workflow_activation_order.json does not exist - skipping sync");
    return false;
  }
  
  try {
    const fileContent = fs.readFileSync(workflowIdsPath, "utf-8");
    let currentConfig = JSON.parse(fileContent);
    
    if (!Array.isArray(currentConfig)) {
      throw new Error("File must contain a JSON array");
    }
    
    let updatedCount = 0;
    
    for (const item of currentConfig) {
      if (!item.name || !item.id) continue;
      
      const serverWf = workflows.find(wf => wf.name === item.name);
      if (serverWf && serverWf.id !== item.id) {
        log.info(`Updating ID for '${item.name}': ${item.id} → ${serverWf.id}`);
        item.id = serverWf.id;
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      currentConfig.sort((a, b) => a.order - b.order);
      fs.writeFileSync(workflowIdsPath, JSON.stringify(currentConfig, null, 2) + "\n", "utf-8");
      log.ok(`Updated workflow_activation_order.json: ${updatedCount} IDs modified`);
    } else {
      log.dim("workflow_activation_order.json is up to date");
    }
    
    return true;
  } catch (e: any) {
    log.err(`Failed to update workflow_activation_order.json: ${e.message}`);
    return false;
  }
}

// Help message
function showHelp() {
  console.log(`
${C.BOLD}n8n_pull_v2.ts - Download N8N Workflows from Server${C.RESET}
═══════════════════════════════════════════════════════════════════════════════

${C.BOLD}USAGE:${C.RESET}
  npx tsx n8n_pull_v2.ts [OPTIONS]

${C.BOLD}OPTIONS:${C.RESET}
  --name, -n <name>           Download workflow by name
  --id, -i <id>               Download workflow by ID
  --all                       Download all workflows
  --seed                      Download only seed workflows (WF1-WF7)
  --output, -o <dir>          Output directory (default: workflows/seed/)
  --url <url>                 Override N8N_API_URL
  --api-key <key>             Override N8N_API_KEY
  --help, -h                  Show this help message

${C.BOLD}EXAMPLES:${C.RESET}
  ${C.CYAN}# Download single workflow by name${C.RESET}
  npx tsx n8n_pull_v2.ts --name WF1_Booking_API_Gateway

  ${C.CYAN}# Download single workflow by ID${C.RESET}
  npx tsx n8n_pull_v2.ts --id urt3akhXLUQKlK7L

  ${C.CYAN}# Download all seed workflows${C.RESET}
  npx tsx n8n_pull_v2.ts --seed

  ${C.CYAN}# Download all workflows to specific directory${C.RESET}
  npx tsx n8n_pull_v2.ts --all --output workflows/backup/

${C.BOLD}ENVIRONMENT VARIABLES:${C.RESET}
  N8N_API_URL / N8N_HOST          n8n instance URL
  N8N_API_KEY / X_N8N_API_KEY     API key

${C.BOLD}EXIT CODES:${C.RESET}
  0  Success
  1  Error (API, file system, or validation)
`);
}

// Main
async function main() {
  const options = parseArgs({
    options: {
      name: { type: 'string', short: 'n' },
      id: { type: 'string', short: 'i' },
      all: { type: 'boolean' },
      seed: { type: 'boolean' },
      output: { type: 'string', short: 'o' },
      url: { type: 'string' },
      'api-key': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowNegative: true,
  });

  if (options.values.help) {
    showHelp();
    return 0;
  }

  const { client } = loadConfig(options.values);
  const outputDir = (options.values.output as string) || 'workflows/seed/';
  const workflowIdsPath = path.join(process.cwd(), 'workflow_activation_order.json');

  // Seed workflow patterns
  const seedPatterns = [
    /^WF[1-7]_/i,
    /^WF1_/i,
    /^WF2_/i,
    /^WF3_/i,
    /^WF4_/i,
    /^WF5_/i,
    /^WF6_/i,
    /^WF7_/i,
  ];

  try {
    let workflowsToDownload: any[] = [];

    // Determine which workflows to download
    if (options.values.id) {
      log.info(`Fetching workflow by ID: ${options.values.id}`);
      const wf = await getWorkflowById(client, options.values.id as string);
      workflowsToDownload = [wf];
    } else if (options.values.name) {
      log.info(`Fetching workflow by name: ${options.values.name}`);
      const wf = await getWorkflowByName(client, options.values.name as string);
      workflowsToDownload = [wf];
    } else {
      log.info('Fetching all workflows from server...');
      const allWorkflows = await fetchAllWorkflows(client);
      
      if (options.values.all) {
        workflowsToDownload = allWorkflows;
      } else if (options.values.seed) {
        workflowsToDownload = allWorkflows.filter(wf => 
          seedPatterns.some(pattern => pattern.test(wf.name))
        );
        log.info(`Found ${workflowsToDownload.length} seed workflow(s)`);
      } else {
        log.err('No operation specified. Use --name, --id, --all, or --seed');
        showHelp();
        return 1;
      }
    }

    if (workflowsToDownload.length === 0) {
      log.warn('No workflows found to download');
      return 0;
    }

    // Download each workflow
    log.info(`Downloading ${workflowsToDownload.length} workflow(s)...`);
    
    for (const wf of workflowsToDownload) {
      log.info(`Processing: ${wf.name} (${wf.id})`);
      
      // Sanitize for local storage
      const localWorkflow = sanitizeForLocal(wf);
      
      // Generate filename
      const filename = wf.name
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_')
        .replace(/_+/g, '_') + '.json';
      
      // Save to file
      const filePath = saveWorkflowToFile(localWorkflow, outputDir, filename);
      log.ok(`Saved: ${filePath}`);
    }

    // Update workflow_activation_order.json
    if (options.values.all || options.values.seed) {
      const allWorkflows = await fetchAllWorkflows(client);
      await updateWorkflowIdsJson(allWorkflows, workflowIdsPath);
    }

    log.ok('Download complete!');
    return 0;
  } catch (error: any) {
    log.err(`Error: ${error.message}`);
    return 1;
  }
}

// Run main
if (require.main === module) {
  (async () => {
    const exitCode = await main();
    process.exit(exitCode);
  })();
}

export {};
