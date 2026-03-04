#!/usr/bin/env tsx
/**
 * Example of how Qwen could use the n8n plugin
 * @migration-source scripts-py/qwen_n8n_integration_demo.py
 */

import { qwenN8nPlugin } from './qwen-n8n-plugin';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

/**
 * Simulate how Qwen might interpret user commands and use the n8n plugin
 */
async function simulateQwenInteraction(): Promise<void> {
  console.log('=== Simulation of Qwen-n8n Interaction ===\n');

  // Simulate different commands that Qwen might receive

  // 1. Command: "List all workflows"
  console.log("User: 'List all workflows'");
  let result = await qwenN8nPlugin('list_workflows');
  let parsedResult = JSON.parse(result);
  console.log(`Response: Found ${parsedResult.count || 0} workflows\n`);

  // 2. Command: "List active workflows"
  console.log("User: 'List active workflows'");
  result = await qwenN8nPlugin('list_active_workflows');
  parsedResult = JSON.parse(result);
  console.log(`Response: Found ${parsedResult.count || 0} active workflows\n`);

  // 3. Command: "Activate workflow with ID leO4EqWL0nWqUhcJ"
  console.log("User: 'Activate workflow with ID leO4EqWL0nWqUhcJ'");
  result = await qwenN8nPlugin('activate_workflow', { workflow_id: 'leO4EqWL0nWqUhcJ' });
  parsedResult = JSON.parse(result);
  console.log(`Response: Activation successful: ${parsedResult.success || false}\n`);

  // 4. Command: "Get information about workflow leO4EqWL0nWqUhcJ"
  console.log("User: 'Get information about workflow leO4EqWL0nWqUhcJ'");
  result = await qwenN8nPlugin('get_workflow_by_id', { workflow_id: 'leO4EqWL0nWqUhcJ' });
  parsedResult = JSON.parse(result);
  if (parsedResult.success) {
    const workflow = parsedResult.data || {};
    console.log(
      `Response: Workflow '${workflow.name || 'Unknown'}' - Status: ${workflow.active ? 'ACTIVE' : 'INACTIVE'}\n`
    );
  } else {
    console.log(`Response: Error getting workflow\n`);
  }

  // 5. Command: "Deactivate workflow with ID leO4EqWL0nWqUhcJ"
  console.log("User: 'Deactivate workflow with ID leO4EqWL0nWqUhcJ'");
  result = await qwenN8nPlugin('deactivate_workflow', { workflow_id: 'leO4EqWL0nWqUhcJ' });
  parsedResult = JSON.parse(result);
  console.log(`Response: Deactivation successful: ${parsedResult.success || false}\n`);

  // 6. Command: "Try to create a workflow"
  console.log("User: 'Create an example workflow'");
  const sampleWorkflow = {
    name: 'Test Workflow from Qwen',
    nodes: [
      {
        parameters: {},
        id: 'qwen-trigger-node',
        name: 'Qwen Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [240, 300] as [number, number],
      },
    ],
    connections: {},
    settings: {
      saveManualExecutions: true,
    },
  };
  result = await qwenN8nPlugin('create_workflow', { workflow_data: sampleWorkflow });
  parsedResult = JSON.parse(result);
  if (parsedResult.success) {
    const newWorkflow = parsedResult.data || {};
    console.log(`Response: Workflow created with ID: ${newWorkflow.id || 'Unknown'}\n`);
  } else {
    console.log(`Response: Error creating workflow: ${parsedResult.error || 'Unknown'}\n`);
  }

  // 7. Command: "Execute workflow with ID leO4EqWL0nWqUhcJ"
  console.log("User: 'Execute workflow with ID leO4EqWL0nWqUhcJ'");
  result = await qwenN8nPlugin('execute_workflow', { workflow_id: 'leO4EqWL0nWqUhcJ' });
  parsedResult = JSON.parse(result);
  console.log(`Response: Execution successful: ${parsedResult.success || false}\n`);

  // 8. Command: "Get executions for workflow leO4EqWL0nWqUhcJ"
  console.log("User: 'Get executions for workflow leO4EqWL0nWqUhcJ'");
  result = await qwenN8nPlugin('get_executions', { workflow_id: 'leO4EqWL0nWqUhcJ', limit: 5 });
  parsedResult = JSON.parse(result);
  if (parsedResult.success) {
    const executions = parsedResult.data || [];
    console.log(`Response: Found ${executions.length} executions\n`);
  } else {
    console.log(`Response: Error getting executions\n`);
  }
}

/**
 * Simulate how Qwen would process a user request and decide to use the n8n plugin
 * @param user_input - User input
 * @returns Response string
 */
export async function qwenProcessUserRequest(user_input: string): Promise<string> {
  console.log(`Processing request: '${user_input}'`);

  // Detect workflow-related intentions
  const userLower = user_input.toLowerCase();

  // Detect workflow IDs in input (simplified)
  const workflowIds: string[] = [];
  for (const word of user_input.split(' ')) {
    if (word.length >= 8 && /^[a-zA-Z0-9_]+$/.test(word)) {
      // Assuming alphanumeric IDs
      workflowIds.push(word);
    }
  }

  // Determine action based on keywords
  if (
    ['list', 'show', 'all', 'workflows', 'workflow'].some((word) => userLower.includes(word))
  ) {
    if (['active', 'running', 'started'].some((word) => userLower.includes(word))) {
      const result = await qwenN8nPlugin('list_active_workflows');
      return `I've listed the active workflows: ${result}`;
    } else {
      const result = await qwenN8nPlugin('list_workflows');
      return `I've listed all workflows: ${result}`;
    }
  } else if (
    ['activate', 'start', 'run', 'publish'].some((word) => userLower.includes(word))
  ) {
    // Try to find a workflow ID in the input
    for (const wfId of workflowIds) {
      if (wfId.length >= 8) {
        // Probably a workflow ID
        const result = await qwenN8nPlugin('activate_workflow', { workflow_id: wfId });
        return `I've attempted to activate workflow ${wfId}: ${result}`;
      }
    }
    return "I couldn't find a workflow ID to activate. Please provide a specific ID.";
  } else if (
    ['deactivate', 'stop', 'pause', 'unpublish'].some((word) => userLower.includes(word))
  ) {
    // Try to find a workflow ID in the input
    for (const wfId of workflowIds) {
      if (wfId.length >= 8) {
        // Probably a workflow ID
        const result = await qwenN8nPlugin('deactivate_workflow', { workflow_id: wfId });
        return `I've attempted to deactivate workflow ${wfId}: ${result}`;
      }
    }
    return "I couldn't find a workflow ID to deactivate. Please provide a specific ID.";
  } else if (
    ['get', 'show', 'info', 'information', 'details'].some((word) => userLower.includes(word)) &&
    workflowIds.some((wfId) => user_input.includes(wfId))
  ) {
    // Try to find a workflow ID in the input
    for (const wfId of workflowIds) {
      if (wfId.length >= 8) {
        // Probably a workflow ID
        const result = await qwenN8nPlugin('get_workflow_by_id', { workflow_id: wfId });
        return `Information about workflow ${wfId}: ${result}`;
      }
    }
    return "I couldn't find a workflow ID to get information. Please provide a specific ID.";
  } else if (['create', 'new', 'add'].some((word) => userLower.includes(word))) {
    // Create a basic workflow
    const sampleWorkflow = {
      name: `Workflow created by Qwen - ${user_input.length}`,
      nodes: [
        {
          parameters: {},
          id: `qwen-trigger-${Math.abs(user_input.hashCode()) % 10000}`,
          name: 'Qwen Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [240, 300] as [number, number],
        },
      ],
      connections: {},
      settings: {
        saveManualExecutions: true,
      },
    };
    const result = await qwenN8nPlugin('create_workflow', { workflow_data: sampleWorkflow });
    return `I've attempted to create a new workflow: ${result}`;
  } else if (['execute', 'run', 'start'].some((word) => userLower.includes(word))) {
    // Try to find a workflow ID in the input
    for (const wfId of workflowIds) {
      if (wfId.length >= 8) {
        // Probably a workflow ID
        const result = await qwenN8nPlugin('execute_workflow', { workflow_id: wfId });
        return `I've attempted to execute workflow ${wfId}: ${result}`;
      }
    }
    return "I couldn't find a workflow ID to execute. Please provide a specific ID.";
  } else if (['executions', 'runs', 'history'].some((word) => userLower.includes(word))) {
    // Try to find a workflow ID in the input
    for (const wfId of workflowIds) {
      if (wfId.length >= 8) {
        // Probably a workflow ID
        const result = await qwenN8nPlugin('get_executions', { workflow_id: wfId, limit: 10 });
        return `Executions for workflow ${wfId}: ${result}`;
      }
    }
    return "I couldn't find a workflow ID to get executions. Please provide a specific ID.";
  } else {
    return "I didn't identify a specific n8n action in your request.";
  }
}

/**
 * String hashCode helper (for ID generation)
 */
declare global {
  interface String {
    hashCode(): number;
  }
}

String.prototype.hashCode = function (): number {
  let hash = 0;
  for (let i = 0; i < this.length; i++) {
    const char = this.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};

/**
 * Main function
 */
async function main(): Promise<void> {
  await simulateQwenInteraction();

  console.log('\n=== Request Processing Simulation ===\n');

  // Example requests that Qwen might receive
  const examples = [
    'List all workflows',
    'Which workflows are active?',
    'Activate workflow leO4EqWL0nWqUhcJ',
    'Stop workflow leO4EqWL0nWqUhcJ',
    'Show me workflow leO4EqWL0nWqUhcJ',
    'Execute workflow leO4EqWL0nWqUhcJ',
    'What are the latest executions for workflow leO4EqWL0nWqUhcJ?',
  ];

  for (const example of examples) {
    const response = await qwenProcessUserRequest(example);
    console.log(`Request: ${example}`);
    console.log(`Response: ${response}\n`);
  }

  // Cancel watchdog on success
  watchdog.cancel();
}

// Run main function if executed directly
if (require.main === module) {
  main().catch((error) => {
    watchdog.cancel();
    console.error('Error:', error);
    process.exit(1);
  });
}

export { simulateQwenInteraction };
