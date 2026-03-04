/**
 * @file n8n_delete.ts
 * @description Migrated from n8n_delete.py - Delete workflow from n8n
 * @migration-date 2026-02-22
 * @migration-tool Qwen 2.5 Coder
 * @requires-review YES — verify N8N API endpoints
 */

import axios, { AxiosError } from 'axios';
import * as readline from 'readline';
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
  [key: string]: unknown;
}

/**
 * Interface for workflow list response
 */
interface WorkflowListResponse {
  data: Workflow[];
}

/**
 * Delete a workflow
 *
 * @param config - N8N configuration
 * @param workflowId - Workflow ID to delete
 * @returns True on success, false on error
 */
export async function deleteWorkflow(
  config: N8NConfig,
  workflowId: string
): Promise<boolean> {
  try {
    const response = await axios.delete(
      config.workflow_endpoint(workflowId),
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
      }
    );

    if (response.status === 200) {
      return true;
    } else {
      console.error(
        `Error deleting workflow ${workflowId}: ${response.status} - ${response.statusText}`
      );
      return false;
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      console.error(`Error: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${String(error)}`);
    }
    return false;
  }
}

/**
 * Deactivate a workflow before deletion
 *
 * @param config - N8N configuration
 * @param workflowId - Workflow ID to deactivate
 * @returns True on success, false on error
 */
export async function deactivateWorkflow(
  config: N8NConfig,
  workflowId: string
): Promise<boolean> {
  try {
    const response = await axios.post(
      `${config.workflow_endpoint(workflowId)}/deactivate`,
      {},
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
      }
    );
    return response.status === 200;
  } catch (error: unknown) {
    return false;
  }
}

/**
 * Get workflow details
 *
 * @param config - N8N configuration
 * @param workflowId - Workflow ID
 * @returns Workflow data or null on error
 */
export async function getWorkflow(
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
    }
    return null;
  } catch (error: unknown) {
    return null;
  }
}

/**
 * List workflows with optional filter
 *
 * @param config - N8N configuration
 * @param nameFilter - Optional name filter
 * @returns Array of workflows or null on error
 */
export async function listWorkflows(
  config: N8NConfig,
  nameFilter?: string
): Promise<Workflow[] | null> {
  try {
    const response = await axios.get<WorkflowListResponse>(
      config.workflow_endpoint(),
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
      }
    );

    if (response.status === 200) {
      let workflows = response.data.data;

      if (nameFilter) {
        const filterLower = nameFilter.toLowerCase();
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
 * Ask user for confirmation
 *
 * @param workflowName - Workflow name
 * @param workflowId - Workflow ID
 * @param isActive - Whether workflow is active
 * @returns Promise resolving to true if confirmed
 */
export async function confirmDelete(
  workflowName: string,
  workflowId: string,
  isActive: boolean
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\nAbout to DELETE workflow:');
  console.log(`  Name: ${workflowName}`);
  console.log(`  ID: ${workflowId}`);
  console.log(`  Status: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
  console.log();

  return new Promise<boolean>((resolve) => {
    rl.question("Are you sure? Type 'yes' to confirm: ", (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Main function - CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let workflowId: string | undefined;
  let workflowName: string | undefined;
  let force = false;
  let deactivateFirst = false;
  let url: string | undefined;
  let apiKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--id' || arg === '-i') {
      workflowId = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      workflowName = args[++i];
    } else if (arg === '--force' || arg === '-f') {
      force = true;
    } else if (arg === '--deactivate-first') {
      deactivateFirst = true;
    } else if (arg === '--url') {
      url = args[++i];
    } else if (arg === '--api-key') {
      apiKey = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
N8N Delete Workflow

Usage:
  npx ts-node n8n_delete.ts [options]

Options:
  --id, -i <id>              Workflow ID to delete (required)
  --name, -n <name>          Workflow name to delete (required, mutually exclusive with --id)
  --force, -f                Skip confirmation prompt
  --deactivate-first         Deactivate workflow before deletion
  --url <url>                Override N8N_API_URL
  --api-key <key>            Override N8N_API_KEY
  --help, -h                 Show this help

Examples:
  npx ts-node n8n_delete.ts --id abc123
  npx ts-node n8n_delete.ts --id abc123 --force
  npx ts-node n8n_delete.ts --name "Test_Workflow"
  npx ts-node n8n_delete.ts --id abc123 --deactivate-first
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

    let targetId = workflowId;
    let targetName: string | undefined;

    // If name provided, find the workflow ID
    if (workflowName) {
      const workflows = await listWorkflows(config);
      if (workflows === null) {
        process.exit(1);
      }

      const found = workflows.find((w) => w.name === workflowName);
      if (!found) {
        console.error(`Error: Workflow '${workflowName}' not found`);
        process.exit(1);
      }

      targetId = found.id;
      targetName = found.name;
    }

    // Get workflow details
    if (targetId) {
      const workflow = await getWorkflow(config, targetId);
      if (workflow) {
        targetName = workflow.name;
        const isActive = workflow.active;

        // Confirm delete unless force flag
        if (!force) {
          const confirmed = await confirmDelete(targetName, targetId, isActive);
          if (!confirmed) {
            console.log('Cancelled.');
            watchdog.cancel();
            process.exit(0);
          }
        }

        // Deactivate first if requested
        if (deactivateFirst && isActive) {
          console.log('Deactivating workflow first...');
          await deactivateWorkflow(config, targetId);
        }

        console.log(`Deleting workflow '${targetName}' (${targetId})...`);

        const success = await deleteWorkflow(config, targetId);
        if (success) {
          console.log('Success! Workflow deleted.');
          watchdog.cancel();
        } else {
          watchdog.cancel();
          process.exit(1);
        }
      } else {
        console.error('Error: Workflow not found');
        watchdog.cancel();
        process.exit(1);
      }
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
