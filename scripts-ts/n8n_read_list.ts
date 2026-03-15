/**
 * @file n8n_read_list.ts
 * @description Migrated from n8n_read_list.py - List workflows from n8n
 * @migration-date 2026-02-22
 * @migration-tool Qwen 2.5 Coder
 * @requires-review YES — verify N8N API endpoints
 */

import axios, { AxiosError } from 'axios';
import { N8NConfig } from './config';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

/**
 * Interface for workflow data
 */
interface Workflow {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Interface for workflow list response
 */
interface WorkflowListResponse {
  data: Workflow[];
}

/**
 * Output format options
 */
type OutputFormat = 'table' | 'json' | 'ids' | 'names';

/**
 * Options for list_workflows function
 */
interface ListWorkflowsOptions {
  active_only?: boolean;
  inactive_only?: boolean;
  name_filter?: string;
}

/**
 * List workflows from n8n
 *
 * @param config - N8N configuration
 * @param options - Filter options
 * @returns Array of workflows or null on error
 */
export async function listWorkflows(
  config: N8NConfig,
  options: ListWorkflowsOptions = {}
): Promise<Workflow[] | null> {
  const { active_only = false, inactive_only = false, name_filter } = options;

  try {
    const response = await axios.get<WorkflowListResponse>(
      config.workflow_endpoint(),
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
        httpsAgent: undefined, // Configure HTTPS agent if verify_ssl is false
      }
    );

    if (response.status === 200) {
      let workflows = response.data.data;

      if (active_only) {
        workflows = workflows.filter((w) => w.active === true);
      } else if (inactive_only) {
        workflows = workflows.filter((w) => w.active === false);
      }

      if (name_filter) {
        const filterLower = name_filter.toLowerCase();
        workflows = workflows.filter((w) =>
          w.name.toLowerCase().includes(filterLower)
        );
      }

      return workflows;
    } else {
      console.error(
        `Error listing workflows: ${response.status} - ${response.statusText}`
      );
      return null;
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      console.error(`Error: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${String(error)}`);
    }
    return null;
  }
}

/**
 * Format workflows as ASCII table
 *
 * @param workflows - Array of workflows
 * @returns Formatted table string
 */
export function formatTable(workflows: Workflow[]): string {
  if (workflows.length === 0) {
    return 'No workflows found.';
  }

  const maxIdLen = Math.max(...workflows.map((w) => String(w.id).length), 2);
  const maxNameLen = Math.max(...workflows.map((w) => w.name.length), 4);

  const idLen = Math.max(maxIdLen, 2);
  const nameLen = Math.max(maxNameLen, 4);

  const header = `ID`.padEnd(idLen) + ' | ' + `Name`.padEnd(nameLen) + ' | Status';
  const separator =
    '-'.repeat(idLen) + '-+-' + '-'.repeat(nameLen) + '-+-' + '-'.repeat(8);

  const lines: string[] = [separator, header, separator];

  for (const w of workflows) {
    const workflowId = String(w.id);
    const name = w.name;
    const status = w.active ? 'ACTIVE  ' : 'INACTIVE';
    lines.push(
      `${workflowId.padEnd(idLen)} | ${name.padEnd(nameLen)} | ${status}`
    );
  }

  lines.push(separator);
  lines.push(`Total: ${workflows.length} workflow(s)`);

  return lines.join('\n');
}

/**
 * Format workflows as JSON
 *
 * @param workflows - Array of workflows
 * @returns JSON string
 */
export function formatJson(workflows: Workflow[]): string {
  return JSON.stringify(workflows, null, 2);
}

/**
 * Format workflows as IDs (one per line)
 *
 * @param workflows - Array of workflows
 * @returns IDs string
 */
export function formatIds(workflows: Workflow[]): string {
  return workflows.map((w) => w.id).join('\n');
}

/**
 * Format workflows as names (one per line)
 *
 * @param workflows - Array of workflows
 * @returns Names string
 */
export function formatNames(workflows: Workflow[]): string {
  return workflows.map((w) => w.name).join('\n');
}

/**
 * Main function - CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let activeOnly = false;
  let inactiveOnly = false;
  let filter: string | undefined;
  let format: OutputFormat = 'table';
  let url: string | undefined;
  let apiKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--active') {
      activeOnly = true;
    } else if (arg === '--inactive') {
      inactiveOnly = true;
    } else if (arg === '--filter' || arg === '-f') {
      filter = args[++i];
    } else if (arg === '--format') {
      const fmt = args[++i] as OutputFormat | undefined;
      if (fmt && ['table', 'json', 'ids', 'names'].includes(fmt)) {
        format = fmt;
      }
    } else if (arg === '--url') {
      url = args[++i];
    } else if (arg === '--api-key') {
      apiKey = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
N8N Read List Workflows

Usage:
  npx ts-node n8n_read_list.ts [options]

Options:
  --active, --inactive    Filter by status (mutually exclusive)
  --filter, -f <text>     Filter by name (case-insensitive)
  --format <format>       Output: table, json, ids, names (default: table)
  --url <url>             Override N8N_API_URL
  --api-key <key>         Override N8N_API_KEY
  --help, -h              Show this help

Examples:
  npx ts-node n8n_read_list.ts
  npx ts-node n8n_read_list.ts --active
  npx ts-node n8n_read_list.ts --inactive
  npx ts-node n8n_read_list.ts --filter "BB_"
  npx ts-node n8n_read_list.ts --format json
  npx ts-node n8n_read_list.ts --format table --active
`);
      process.exit(0);
    }
  }

  // Validate mutually exclusive options
  if (activeOnly && inactiveOnly) {
    console.error('Error: --active and --inactive are mutually exclusive');
    process.exit(1);
  }

  try {
    const config = new N8NConfig({ api_url: url, api_key: apiKey });

    const workflows = await listWorkflows(config, {
      active_only: activeOnly,
      inactive_only: inactiveOnly,
      name_filter: filter ?? undefined,
    });

    if (workflows === null) {
      watchdog.cancel();
      process.exit(1);
    }

    // Output based on format
    switch (format) {
      case 'json':
        console.log(formatJson(workflows));
        break;
      case 'ids':
        console.log(formatIds(workflows));
        break;
      case 'names':
        console.log(formatNames(workflows));
        break;
      case 'table':
      default:
        console.log(formatTable(workflows));
        break;
    }
    watchdog.cancel();
  } catch (error: unknown) {
    watchdog.cancel();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

// Run main function
main().catch((error: unknown) => {
  watchdog.cancel();
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
