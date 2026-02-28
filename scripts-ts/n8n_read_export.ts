/**
 * @file n8n_read_export.ts
 * @description Migrated from n8n_read_export.py - Export workflows to JSON files
 * @migration-date 2026-02-22
 * @migration-tool Qwen 2.5 Coder
 * @requires-review YES — verify N8N API endpoints
 */

import axios, { AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { N8NConfig } from './config';

/**
 * Interface for workflow data
 */
interface Workflow {
  id: string;
  name: string;
  active: boolean;
  nodes?: unknown[];
  connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Interface for workflow list response
 */
interface WorkflowListResponse {
  data: Workflow[];
}

/**
 * Export a workflow to JSON file
 *
 * @param config - N8N configuration
 * @param workflowId - Workflow ID to export
 * @param outputPath - Output file path
 * @returns True on success, false on error
 */
export async function exportWorkflow(
  config: N8NConfig,
  workflowId: string,
  outputPath: string
): Promise<boolean> {
  try {
    const response = await axios.get<Workflow>(
      config.workflow_endpoint(workflowId),
      {
        headers: config.headers,
        timeout: config.timeout * 1000,
      }
    );

    if (response.status === 200) {
      const workflow = response.data;

      // Ensure output directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write workflow to file
      fs.writeFileSync(
        outputPath,
        JSON.stringify(workflow, null, 2),
        'utf-8'
      );

      return true;
    } else {
      console.error(
        `Error getting workflow: ${response.status} - ${response.statusText}`
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
 * Sanitize workflow name for filename
 *
 * @param name - Workflow name
 * @returns Sanitized filename-safe string
 */
export function sanitizeFilename(name: string): string {
  let safe = name.replace(/[^a-zA-Z0-9 _-]/g, '_');
  return safe.trim().replace(/\s+/g, '_');
}

/**
 * Main function - CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let workflowId: string | undefined;
  let workflowName: string | undefined;
  let exportAll = false;
  let filter: string | undefined;
  let output: string | undefined;
  let outputDir: string | undefined;
  let url: string | undefined;
  let apiKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--id' || arg === '-i') {
      workflowId = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      workflowName = args[++i];
    } else if (arg === '--all' || arg === '-a') {
      exportAll = true;
    } else if (arg === '--filter' || arg === '-f') {
      filter = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      output = args[++i];
    } else if (arg === '--output-dir' || arg === '-d') {
      outputDir = args[++i];
    } else if (arg === '--url') {
      url = args[++i];
    } else if (arg === '--api-key') {
      apiKey = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
N8N Export Workflows

Usage:
  npx ts-node n8n_read_export.ts [options]

Options:
  --id, -i <id>          Export workflow by ID
  --name, -n <name>      Export workflow by name (exact match)
  --all, -a              Export all workflows
  --filter, -f <text>    Export workflows matching name filter
  --output, -o <file>    Output file (for single workflow)
  --output-dir, -d <dir> Output directory (for multiple workflows)
  --url <url>            Override N8N_API_URL
  --api-key <key>        Override N8N_API_KEY
  --help, -h             Show this help

Examples:
  npx ts-node n8n_read_export.ts --id abc123 --output workflow.json
  npx ts-node n8n_read_export.ts --name "BB_00_Global_Error_Handler" --output workflow.json
  npx ts-node n8n_read_export.ts --all --output-dir ./exports/
  npx ts-node n8n_read_export.ts --filter "BB_" --output-dir ./workflows/
`);
      process.exit(0);
    }
  }

  // Validate arguments
  if ((exportAll || filter) && !outputDir) {
    console.error('Error: --output-dir is required when using --all or --filter');
    process.exit(1);
  }

  if ((workflowId || workflowName) && !output) {
    console.error('Error: --output is required when exporting single workflow');
    process.exit(1);
  }

  try {
    const config = new N8NConfig({ api_url: url, api_key: apiKey });

    if (workflowId) {
      // Export single workflow by ID
      if (output) {
        const outputPath = path.resolve(output);
        console.log(`Exporting workflow ${workflowId} to: ${outputPath}`);

        const success = await exportWorkflow(config, workflowId, outputPath);

        if (success) {
          console.log('Success! Workflow exported.');
        } else {
          process.exit(1);
        }
      }
    } else if (workflowName) {
      // Export single workflow by name
      const workflows = await listWorkflows(config);

      if (workflows === null) {
        process.exit(1);
      }

      const found = workflows.find((w) => w.name === workflowName);

      if (!found) {
        console.error(`Error: Workflow '${workflowName}' not found`);
        process.exit(1);
      }

      if (output) {
        const outputPath = path.resolve(output);
        console.log(`Exporting workflow '${workflowName}' (${found.id}) to: ${outputPath}`);

        const success = await exportWorkflow(config, found.id, outputPath);

        if (success) {
          console.log('Success! Workflow exported.');
        } else {
          process.exit(1);
        }
      }
    } else if (exportAll || filter) {
      // Export multiple workflows
      if (!outputDir) {
        console.error('Error: --output-dir is required');
        process.exit(1);
      }

      const outputDirectory = path.resolve(outputDir);
      console.log(`Exporting workflows to: ${outputDirectory}`);

      // Ensure output directory exists
      if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
      }

      const workflows = await listWorkflows(config, filter);

      if (workflows === null) {
        process.exit(1);
      }

      if (workflows.length === 0) {
        console.log('No workflows found to export.');
        process.exit(0);
      }

      let successCount = 0;

      for (const workflow of workflows) {
        const workflowId = workflow.id;
        const workflowName = workflow.name;
        const filename = `${sanitizeFilename(workflowName)}.json`;
        const outputPath = path.join(outputDirectory, filename);

        console.log(`Exporting: ${workflowName} (${workflowId}) -> ${filename}`);

        if (await exportWorkflow(config, workflowId, outputPath)) {
          successCount++;
        }
      }

      console.log(`\nExported ${successCount}/${workflows.length} workflows to: ${outputDirectory}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

// Run main function
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
