#!/usr/bin/env tsx
/**
 * Utility functions for n8n workflow management
 * @migration-source scripts-py/utils.py
 */

import * as fs from 'fs';
import { N8NCrudAgent, WorkflowData } from './n8n_crud_agent';

/**
 * Simple function to list all workflows
 * @param api_url - n8n API URL
 */
export async function listWorkflowsSimple(api_url: string = 'https://n8n.stax.ink'): Promise<void> {
  const agent = new N8NCrudAgent(api_url);

  console.log('Fetching all workflows from n8n...');
  console.log(`URL: ${api_url}`);

  const allWorkflows = await agent.listWorkflows();

  if (allWorkflows !== null) {
    if (allWorkflows.length > 0) {
      console.log(`\nFound ${allWorkflows.length} workflow(s):\n`);
      for (let idx = 0; idx < allWorkflows.length; idx++) {
        const workflow = allWorkflows[idx];
        const workflowId = workflow.id || 'Unknown ID';
        const workflowName = workflow.name || 'Unnamed Workflow';
        const workflowActive = workflow.active || false;
        const status = workflowActive ? 'ACTIVE' : 'INACTIVE';
        console.log(`${idx + 1}. ID: ${workflowId} | Name: ${workflowName} | Status: ${status}`);

        // If workflow is inactive, suggest activation
        if (!workflowActive) {
          console.log(`   To activate this workflow, use: agent.activateWorkflow('${workflowId}')`);
        }
      }
    } else {
      console.log('\nNo workflows found in the n8n instance.');
    }
  } else {
    console.log('\nFailed to retrieve workflows.');
  }
}

/**
 * Simple function to list active workflows
 * @param api_url - n8n API URL
 */
export async function listActiveWorkflowsSimple(api_url: string = 'https://n8n.stax.ink'): Promise<void> {
  const agent = new N8NCrudAgent(api_url);

  console.log('Fetching active workflows from n8n...');
  console.log(`URL: ${api_url}`);

  const activeWorkflows = await agent.listActiveWorkflows();

  if (activeWorkflows !== null) {
    if (activeWorkflows.length > 0) {
      console.log(`\nFound ${activeWorkflows.length} active workflow(s):\n`);
      for (let idx = 0; idx < activeWorkflows.length; idx++) {
        const workflow = activeWorkflows[idx];
        const workflowId = workflow.id || 'Unknown ID';
        const workflowName = workflow.name || 'Unnamed Workflow';
        console.log(`${idx + 1}. ID: ${workflowId} | Name: ${workflowName}`);
      }
    } else {
      console.log('\nNo active workflows found.');
    }
  } else {
    console.log('\nFailed to retrieve workflows.');
  }
}

/**
 * Simple function to activate a specific workflow
 * @param workflow_id - Workflow ID to activate
 * @param api_url - n8n API URL
 */
export async function activateWorkflowSimple(
  workflow_id: string,
  api_url: string = 'https://n8n.stax.ink'
): Promise<void> {
  const agent = new N8NCrudAgent(api_url);

  console.log(`Attempting to activate workflow ${workflow_id}...`);
  console.log(`URL: ${api_url}`);

  const success = await agent.activateWorkflow(workflow_id);

  if (success) {
    console.log(`\n✓ Workflow ${workflow_id} has been successfully activated!`);

    // Verify the activation
    console.log(`\nVerifying activation status...`);
    try {
      const workflowData = await agent.getWorkflowById(workflow_id);
      if (workflowData) {
        const isActive = workflowData.active || false;
        const workflowName = workflowData.name || 'Unknown';
        console.log(
          `✓ Verification: Workflow '${workflowName}' (ID: ${workflow_id}) is ${isActive ? 'ACTIVE' : 'INACTIVE'}`
        );
      } else {
        console.log(`✗ Could not verify activation status: Workflow not found`);
      }
    } catch (error: any) {
      console.log(`✗ Could not verify activation status: ${error.message}`);
    }
  } else {
    console.log(`\n✗ Failed to activate workflow ${workflow_id}`);
  }
}

/**
 * Create a new workflow with a proper trigger and then activate it
 * @param workflow_name - Name for the new workflow
 * @param api_url - n8n API URL
 */
export async function createAndActivateWorkflowWithTrigger(
  workflow_name: string,
  api_url: string = 'https://n8n.stax.ink'
): Promise<void> {
  const agent = new N8NCrudAgent(api_url);

  // Generate unique IDs
  const triggerId = `trigger-${Math.random().toString(36).substring(2, 10)}`;
  const setId = `set-${Math.random().toString(36).substring(2, 10)}`;

  // Define a workflow with a proper trigger
  const workflowData: WorkflowData = {
    name: workflow_name,
    nodes: [
      {
        parameters: {},
        id: triggerId,
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        typeVersion: 1,
        position: [240, 300] as [number, number],
      },
      {
        parameters: {
          values: {
            string: [
              {
                name: 'message',
                value: 'Hello from scheduled workflow!',
              },
            ],
          },
        },
        id: setId,
        name: 'Set Node',
        type: 'n8n-nodes-base.set',
        typeVersion: 1,
        position: [460, 300] as [number, number],
      },
    ],
    connections: {
      'Schedule Trigger': {
        main: [
          [
            {
              node: 'Set Node',
              type: 'main',
              index: 0,
            },
          ],
        ],
      },
    },
    settings: {
      saveManualExecutions: true,
    },
  };

  console.log(`Creating new workflow with proper trigger: ${workflow_name}`);

  // Create a new workflow with a proper trigger
  const createdWorkflow = await agent.createWorkflow(workflowData);

  if (createdWorkflow) {
    const workflowId = createdWorkflow.id || '';

    console.log(`\nAttempting to activate workflow ${workflowId}...`);
    const success = await agent.activateWorkflow(workflowId);

    if (success) {
      console.log(`\n✓ Workflow '${workflow_name}' (ID: ${workflowId}) has been successfully created AND activated!`);

      // Verify the activation
      try {
        const workflowData = await agent.getWorkflowById(workflowId);
        if (workflowData) {
          const isActive = workflowData.active || false;
          const workflowName = workflowData.name || 'Unknown';
          console.log(
            `✓ Verification: Workflow '${workflowName}' is ${isActive ? 'ACTIVE' : 'INACTIVE'}`
          );
        } else {
          console.log(`✗ Could not verify activation status: Workflow not found`);
        }
      } catch (error: any) {
        console.log(`✗ Could not verify activation status: ${error.message}`);
      }
    } else {
      console.log(`\n✗ Failed to activate workflow ${workflowId}`);
    }
  } else {
    console.log('✗ Failed to create workflow');
  }
}

/**
 * Execute a workflow manually
 * @param workflow_id - Workflow ID to execute
 * @param api_url - n8n API URL
 */
export async function executeWorkflowManually(
  workflow_id: string,
  api_url: string = 'https://n8n.stax.ink'
): Promise<void> {
  const agent = new N8NCrudAgent(api_url);

  console.log(`Executing workflow ${workflow_id} manually...`);

  const result = await agent.executeWorkflow(workflow_id);

  if (result) {
    console.log('Workflow executed successfully!');
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Failed to execute workflow ${workflow_id}`);
  }
}

/**
 * Get recent executions for a workflow
 * @param workflow_id - Workflow ID
 * @param limit - Number of executions to retrieve
 * @param api_url - n8n API URL
 */
export async function getRecentExecutions(
  workflow_id: string,
  limit: number = 5,
  api_url: string = 'https://n8n.stax.ink'
): Promise<void> {
  const agent = new N8NCrudAgent(api_url);

  console.log(`\nRecent executions for workflow ${workflow_id}:`);

  const executions = await agent.getExecutions(workflow_id, limit);

  if (executions) {
    for (let i = 0; i < executions.length; i++) {
      const execution = executions[i];
      console.log(`  Execution ${i + 1}:`);
      console.log(`    ID: ${execution.id}`);
      console.log(`    Status: ${execution.status}`);
      console.log(`    Started: ${execution.startedAt}`);
      console.log(`    Ended: ${execution.stoppedAt || 'N/A'}`);
      console.log(`    Mode: ${execution.mode}`);
    }
  } else {
    console.log(`No executions found for workflow ${workflow_id}`);
  }
}

/**
 * Load workflow from JSON file
 * @param file_path - Path to the JSON file containing the workflow
 * @returns Workflow data as object
 */
export function loadWorkflowFromJson(file_path: string): WorkflowData {
  const content = fs.readFileSync(file_path, 'utf-8');
  return JSON.parse(content) as WorkflowData;
}

/**
 * Execute the workflow from the JSON file
 * @param file_path - Path to the JSON file
 * @param api_url - n8n API URL
 */
export async function executeWorkflowFromJson(
  file_path: string,
  api_url: string = 'https://n8n.stax.ink'
): Promise<void> {
  const agent = new N8NCrudAgent(api_url);

  // Load the workflow from the JSON file
  console.log('Loading workflow from JSON file...');
  const workflowData = loadWorkflowFromJson(file_path);

  // Extract workflow ID from the loaded data
  const workflowId = workflowData.id;

  if (!workflowId) {
    console.log('Error: Workflow ID not found in JSON file.');
    return;
  }

  console.log(`Loaded workflow: ${workflowData.name || 'Unknown'}`);

  // Create the workflow in n8n
  console.log('\nCreating workflow in n8n...');
  const createdWorkflow = await agent.createWorkflow(workflowData);

  if (!createdWorkflow) {
    console.log(`Error creating workflow`);
    return;
  }

  const workflow_id = createdWorkflow.id || '';
  const workflow_name = createdWorkflow.name || '';

  console.log('Workflow created successfully!');
  console.log(`ID: ${workflow_id}`);
  console.log(`Name: ${workflow_name}`);

  // Activate the workflow to make it executable
  console.log(`\nActivating workflow ${workflow_id}...`);
  const activationSuccess = await agent.activateWorkflow(workflow_id);

  if (!activationSuccess) {
    console.log(`Error activating workflow`);
    console.log('Note: This workflow may require a trigger node to be activated.');
  } else {
    console.log('Workflow activated successfully!');
  }

  // Get the workflow details to confirm it was created correctly
  console.log(`\nGetting workflow details for ${workflow_id}...`);
  const workflowInfo = await agent.getWorkflowById(workflow_id);

  if (workflowInfo) {
    console.log('Workflow retrieved successfully:');
    console.log(`  Name: ${workflowInfo.name}`);
    console.log(`  Active: ${workflowInfo.active || false}`);
    console.log(`  Trigger Count: ${workflowInfo.triggerCount || 0}`);
  } else {
    console.log(`Error getting workflow details`);
  }
}

/**
 * Main function for standalone execution
 */
async function main() {
  console.log('=== n8n Utility Functions ===\n');
  console.log('Available functions:');
  console.log('• listWorkflowsSimple(api_url)');
  console.log('• listActiveWorkflowsSimple(api_url)');
  console.log('• activateWorkflowSimple(workflow_id, api_url)');
  console.log('• createAndActivateWorkflowWithTrigger(workflow_name, api_url)');
  console.log('• executeWorkflowManually(workflow_id, api_url)');
  console.log('• getRecentExecutions(workflow_id, limit, api_url)');
  console.log('• loadWorkflowFromJson(file_path)');
  console.log('• executeWorkflowFromJson(file_path, api_url)');

  // Example: List workflows
  console.log('\n--- Example: List Workflows ---');
  await listWorkflowsSimple();
}

// Run main function if executed directly
if (require.main === module) {
  main();
}
