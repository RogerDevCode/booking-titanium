/**
 * @file n8n_read_get.ts
 * @description Migrated from n8n_read_get.py - Get workflow by ID or name
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
 * Interface for workflow node
 */
interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Interface for workflow data
 */
interface Workflow {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  triggerCount?: number;
  nodes?: WorkflowNode[];
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
type OutputFormat = 'summary' | 'json' | 'nodes';

/**
 * Get a workflow by ID
 *
 * @param config - N8N configuration
 * @param workflowId - Workflow ID
 * @returns Workflow data or null on error
 */
export async function getWorkflowById(
  config: N8NConfig,
  workflowId: string
): Promise<Workflow | null> {
  try {
    const response = await axios.get<Workflow>(
      config.workflow_endpoint(workflowId),
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      console.error(
        `Error getting workflow: ${response.status} - ${response.statusText}`
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
 * Get a workflow by name (searches all workflows)
 *
 * @param config - N8N configuration
 * @param name - Workflow name (exact match)
 * @returns Workflow data or null on error
 */
export async function getWorkflowByName(
  config: N8NConfig,
  name: string
): Promise<Workflow | null> {
  try {
    const response = await axios.get<WorkflowListResponse>(
      config.workflow_endpoint(),
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
      }
    );

    if (response.status === 200) {
      const workflows = response.data.data;
      const workflow = workflows.find((w) => w.name === name);

      if (!workflow) {
        console.error(`Workflow '${name}' not found`);
        return null;
      }

      return await getWorkflowById(config, workflow.id);
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
 * Format workflow as summary
 *
 * @param workflow - Workflow data
 * @returns Formatted summary string
 */
export function formatSummary(workflow: Workflow): string {
  const lines: string[] = [
    `ID: ${workflow.id}`,
    `Name: ${workflow.name}`,
    `Active: ${workflow.active ? 'Yes' : 'No'}`,
    `Created: ${workflow.createdAt ?? 'N/A'}`,
    `Updated: ${workflow.updatedAt ?? 'N/A'}`,
    `Trigger Count: ${workflow.triggerCount ?? 0}`,
  ];

  const nodes = workflow.nodes ?? [];
  if (nodes.length > 0) {
    lines.push(`Nodes: ${nodes.length}`);

    const nodeTypes: Record<string, number> = {};
    for (const node of nodes) {
      const nodeType = node.type ?? 'unknown';
      nodeTypes[nodeType] = (nodeTypes[nodeType] ?? 0) + 1;
    }

    lines.push('Node types:');
    for (const [nodeType, count] of Object.entries(nodeTypes).sort()) {
      lines.push(`  - ${nodeType}: ${count}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format workflow nodes as list
 *
 * @param workflow - Workflow data
 * @returns Formatted nodes string
 */
export function formatNodes(workflow: Workflow): string {
  const nodes = workflow.nodes ?? [];

  if (nodes.length === 0) {
    return 'No nodes found.';
  }

  const lines: string[] = [`Nodes in '${workflow.name}':`, ''];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const num = i + 1;
    lines.push(`${num}. ${node.name} (${node.type})`);
    lines.push(`   ID: ${node.id}`);
    if (node.position) {
      lines.push(`   Position: [${node.position[0]}, ${node.position[1]}]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Main function - CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let workflowId: string | undefined;
  let workflowName: string | undefined;
  let format: OutputFormat = 'summary';
  let url: string | undefined;
  let apiKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--id' || arg === '-i') {
      workflowId = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      workflowName = args[++i];
    } else if (arg === '--format') {
      const fmt = args[++i] as OutputFormat | undefined;
      if (fmt && ['summary', 'json', 'nodes'].includes(fmt)) {
        format = fmt;
      }
    } else if (arg === '--url') {
      url = args[++i];
    } else if (arg === '--api-key') {
      apiKey = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
N8N Read Get Workflow

Usage:
  npx ts-node n8n_read_get.ts [options]

Options:
  --id, -i <id>           Workflow ID (required)
  --name, -n <name>       Workflow name (required, mutually exclusive with --id)
  --format <format>       Output: summary (default), json, or nodes
  --url <url>             Override N8N_API_URL
  --api-key <key>         Override N8N_API_KEY
  --help, -h              Show this help

Examples:
  npx ts-node n8n_read_get.ts --id abc123
  npx ts-node n8n_read_get.ts --name "BB_00_Global_Error_Handler"
  npx ts-node n8n_read_get.ts --id abc123 --format json
  npx ts-node n8n_read_get.ts --id abc123 --nodes
`);
      process.exit(0);
    }
  }

  // Validate ID or name is provided
  if (!workflowId && !workflowName) {
    console.error('Error: --id or --name is required');
    process.exit(1);
  }

  try {
    const config = new N8NConfig({ api_url: url, api_key: apiKey });

    let workflow: Workflow | null;

    if (workflowName) {
      workflow = await getWorkflowByName(config, workflowName);
    } else if (workflowId) {
      workflow = await getWorkflowById(config, workflowId);
    } else {
      workflow = null;
    }

    if (workflow === null) {
      watchdog.cancel();
      process.exit(1);
    }

    // Output based on format
    switch (format) {
      case 'json':
        console.log(JSON.stringify(workflow, null, 2));
        break;
      case 'nodes':
        console.log(formatNodes(workflow));
        break;
      case 'summary':
      default:
        console.log(formatSummary(workflow));
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
