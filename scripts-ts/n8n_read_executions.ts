/**
 * @file n8n_read_executions.ts
 * @description Migrated from n8n_read_executions.py - List and view workflow executions
 * @migration-date 2026-02-22
 * @migration-tool Qwen 2.5 Coder
 * @requires-review YES — verify N8N execution API endpoints
 */

import axios, { AxiosError } from 'axios';
import { N8NConfig } from './config';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

/**
 * Execution status enum
 */
type ExecutionStatus = 'success' | 'error' | 'running' | 'waiting' | 'unknown';

/**
 * Interface for execution data
 */
interface Execution {
  id: string;
  status: ExecutionStatus;
  workflowId: string;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  error?: {
    message: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Interface for execution list response
 */
interface ExecutionListResponse {
  data: Execution[];
}

/**
 * Output format options
 */
type OutputFormat = 'table' | 'json' | 'summary';

/**
 * Options for listExecutions function
 */
interface ListExecutionsOptions {
  workflowId?: string;
  limit?: number;
  status?: ExecutionStatus;
}

/**
 * List executions from n8n
 *
 * @param config - N8N configuration
 * @param options - Filter options
 * @returns Array of executions or null on error
 */
export async function listExecutions(
  config: N8NConfig,
  options: ListExecutionsOptions = {}
): Promise<Execution[] | null> {
  const { workflowId, limit = 10, status } = options;

  try {
    const params: Record<string, string> = {
      limit: limit.toString(),
      includeData: 'true',
    };

    if (workflowId) {
      params.workflowId = workflowId;
    }

    const response = await axios.get<ExecutionListResponse>(
      config.execution_endpoint(),
      {
        headers: config.headers,
        params,
        timeout: config.timeout * 1000,
      }
    );

    if (response.status === 200) {
      let executions = response.data.data;

      if (status) {
        executions = executions.filter((e) => e.status === status);
      }

      return executions;
    } else {
      console.error(
        `Error listing executions: ${response.status} - ${response.statusText}`
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
 * Get a specific execution by ID
 *
 * @param config - N8N configuration
 * @param executionId - Execution ID
 * @returns Execution data or null on error
 */
export async function getExecution(
  config: N8NConfig,
  executionId: string
): Promise<Execution | null> {
  try {
    const response = await axios.get<Execution>(
      `${config.execution_endpoint(executionId)}?includeData=true`,
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      console.error(
        `Error getting execution: ${response.status} - ${response.statusText}`
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
 * Format execution as summary
 *
 * @param execution - Execution data
 * @returns Formatted summary string
 */
export function formatExecutionSummary(execution: Execution): string {
  const status = execution.status ?? 'unknown';
  const statusEmoji: Record<string, string> = {
    success: '✓',
    error: '✗',
    running: '⏳',
    waiting: '⏸',
  };
  const emoji = statusEmoji[status] ?? '?';

  const lines: string[] = [
    `Execution ID: ${execution.id}`,
    `Status: ${emoji} ${status}`,
    `Workflow ID: ${execution.workflowId}`,
    `Mode: ${execution.mode ?? 'N/A'}`,
    `Started: ${execution.startedAt ?? 'N/A'}`,
    `Stopped: ${execution.stoppedAt ?? 'N/A'}`,
  ];

  if (status === 'error' && execution.error) {
    lines.push(`Error: ${execution.error.message ?? String(execution.error)}`);
  }

  return lines.join('\n');
}

/**
 * Format executions as table
 *
 * @param executions - Array of executions
 * @returns Formatted table string
 */
export function formatExecutionsTable(executions: Execution[]): string {
  if (executions.length === 0) {
    return 'No executions found.';
  }

  const lines: string[] = [
    `ID`.padEnd(12) +
      ' | ' +
      `Status`.padEnd(8) +
      ' | ' +
      `Workflow`.padEnd(20) +
      ' | ' +
      `Started`.padEnd(20),
    '-'.repeat(12) +
      '-+-' +
      '-'.repeat(8) +
      '-+-' +
      '-'.repeat(20) +
      '-+-' +
      '-'.repeat(20),
  ];

  for (const e of executions) {
    const execId = String(e.id ?? '').slice(0, 12);
    const status = String(e.status ?? '').slice(0, 8);
    const workflow = String(e.workflowId ?? '').slice(0, 20);
    const started = (e.startedAt ?? '').slice(0, 19).replace('T', ' ');
    lines.push(
      `${execId.padEnd(12)} | ${status.padEnd(8)} | ${workflow.padEnd(20)} | ${started.padEnd(20)}`
    );
  }

  lines.push(`\nTotal: ${executions.length} execution(s)`);

  return lines.join('\n');
}

/**
 * Parse status string to ExecutionStatus
 *
 * @param status - Status string
 * @returns ExecutionStatus enum value
 */
function parseStatus(status: string): ExecutionStatus {
  const validStatuses: ExecutionStatus[] = [
    'success',
    'error',
    'running',
    'waiting',
    'unknown',
  ];
  return validStatuses.includes(status as ExecutionStatus)
    ? (status as ExecutionStatus)
    : 'unknown';
}

/**
 * Main function - CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let workflowId: string | undefined;
  let executionId: string | undefined;
  let limit = 10;
  let status: ExecutionStatus | undefined;
  let format: OutputFormat = 'table';
  let url: string | undefined;
  let apiKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--workflow' || arg === '-w') {
      workflowId = args[++i];
    } else if (arg === '--execution' || arg === '-e') {
      executionId = args[++i];
    } else if (arg === '--limit' || arg === '-l') {
      const limitArg = args[++i];
      if (limitArg) {
        limit = parseInt(limitArg, 10) || 10;
      }
    } else if (arg === '--status' || arg === '-s') {
      const statusArg = args[++i];
      if (statusArg) {
        status = parseStatus(statusArg);
      }
    } else if (arg === '--format') {
      const fmt = args[++i] as OutputFormat | undefined;
      if (fmt && ['table', 'json', 'summary'].includes(fmt)) {
        format = fmt;
      }
    } else if (arg === '--url') {
      url = args[++i];
    } else if (arg === '--api-key') {
      apiKey = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
N8N Read Executions

Usage:
  npx ts-node n8n_read_executions.ts [options]

Options:
  --workflow, -w <id>     Filter by workflow ID
  --execution, -e <id>    Get specific execution by ID
  --limit, -l <number>    Maximum executions to return (default: 10)
  --status, -s <status>   Filter by status: success, error, running, waiting
  --format <format>       Output: table (default), json, or summary
  --url <url>             Override N8N_API_URL
  --api-key <key>         Override N8N_API_KEY
  --help, -h              Show this help

Examples:
  npx ts-node n8n_read_executions.ts
  npx ts-node n8n_read_executions.ts --workflow WORKFLOW_ID
  npx ts-node n8n_read_executions.ts --execution EXECUTION_ID
  npx ts-node n8n_read_executions.ts --workflow WORKFLOW_ID --limit 20
  npx ts-node n8n_read_executions.ts --status error
`);
      process.exit(0);
    }
  }

  try {
    const config = new N8NConfig({ api_url: url, api_key: apiKey });

    if (executionId) {
      // Get specific execution
      const execution = await getExecution(config, executionId);

      if (execution === null) {
        process.exit(1);
      }

      if (format === 'json') {
        console.log(JSON.stringify(execution, null, 2));
      } else {
        console.log(formatExecutionSummary(execution));
      }
      watchdog.cancel();
    } else {
      // List executions
      const executions = await listExecutions(config, {
        workflowId,
        limit,
        status,
      });

      if (executions === null) {
        watchdog.cancel();
        process.exit(1);
      }

      if (executions.length === 0) {
        console.log('No executions found.');
        watchdog.cancel();
        process.exit(0);
      }

      // Output based on format
      switch (format) {
        case 'json':
          console.log(JSON.stringify(executions, null, 2));
          break;
        case 'summary':
          for (const exec of executions) {
            console.log(formatExecutionSummary(exec));
            console.log('---');
          }
          break;
        case 'table':
        default:
          console.log(formatExecutionsTable(executions));
          break;
      }
      watchdog.cancel();
    }
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
