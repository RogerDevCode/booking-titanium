#!/usr/bin/env tsx
/**
 * Example script demonstrating how to use the N8N CRUD Agent to create and manage workflows
 * @migration-source scripts-py/example_usage.py
 */

import { N8NCrudAgent, WorkflowData } from './n8n-crud-agent';

async function createExampleWorkflow(): Promise<void> {
  // Configuration
  const API_URL = 'https://n8n.stax.ink';

  // Initialize the agent (will use N8N_API_KEY or N8N_ACCESS_TOKEN automatically)
  const agent = new N8NCrudAgent(API_URL);

  // Define a simple example workflow
  const exampleWorkflow: WorkflowData = {
    name: 'Example Trigger Workflow',
    nodes: [
      {
        parameters: {},
        id: '1c2cef1c-6cb0-46b8-bfd9-7e4b67dda1a3',
        name: 'My Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [240, 300] as [number, number],
      },
      {
        parameters: {
          values: {
            string: [
              {
                name: 'returnValue',
                value: '={{$json.input1}}',
              },
            ],
          },
          options: {},
        },
        id: '5f5a1e2c-5e4d-452e-b623-74413451399c',
        name: 'Set node',
        type: 'n8n-nodes-base.set',
        typeVersion: 1,
        position: [460, 300] as [number, number],
      },
    ],
    connections: {
      'My Trigger': {
        main: [
          [
            {
              node: 'Set node',
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

  console.log('Creating example workflow...');
  const createdWorkflow = await agent.createWorkflow(exampleWorkflow);

  if (createdWorkflow) {
    const workflowId = createdWorkflow.id || '';
    const workflowName = createdWorkflow.name || '';
    console.log(`✓ Successfully created workflow: '${workflowName}' with ID: ${workflowId}`);

    // Optionally activate the workflow
    console.log(`Activating workflow ${workflowId}...`);
    if (await agent.activateWorkflow(workflowId)) {
      console.log(`✓ Successfully activated workflow: ${workflowName}`);
    } else {
      console.log(`✗ Failed to activate workflow: ${workflowName}`);
    }

    // List all workflows again to confirm
    console.log('\n--- All workflows after creation ---');
    const workflows = await agent.listWorkflows();
    if (workflows) {
      for (const wf of workflows) {
        const status = wf.active ? 'ACTIVE' : 'INACTIVE';
        console.log(`  - ID: ${wf.id} | Name: ${wf.name} | Status: ${status}`);
      }
    }

    // Show how to update the workflow
    console.log(`\n--- Updating workflow ${workflowId} ---`);
    const updateData: WorkflowData = {
      name: `Updated ${workflowName}`,
      active: false, // Keep it inactive after update
      nodes: [
        {
          parameters: {},
          id: '1c2cef1c-6cb0-46b8-bfd9-7e4b67dda1a3',
          name: 'My Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [240, 300] as [number, number],
        },
        {
          parameters: {
            values: {
              string: [
                {
                  name: 'returnValue',
                  value: '={{$json.input1}}',
                },
              ],
            },
            options: {},
          },
          id: '5f5a1e2c-5e4d-452e-b623-74413451399c',
          name: 'Set node',
          type: 'n8n-nodes-base.set',
          typeVersion: 1,
          position: [460, 300] as [number, number],
        },
      ],
      connections: {
        'My Trigger': {
          main: [
            [
              {
                node: 'Set node',
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
    const updatedWorkflow = await agent.updateWorkflow(workflowId, updateData);
    if (updatedWorkflow) {
      console.log(`✓ Successfully updated workflow to: '${updatedWorkflow.name}'`);
    } else {
      console.log('✗ Failed to update workflow');
    }

    // Demonstrate getting a specific workflow
    console.log(`\n--- Getting workflow by ID: ${workflowId} ---`);
    const retrievedWorkflow = await agent.getWorkflowById(workflowId);
    if (retrievedWorkflow) {
      console.log(`✓ Retrieved workflow: '${retrievedWorkflow.name}'`);
    } else {
      console.log('✗ Failed to retrieve workflow');
    }

    // Show how to deactivate the workflow
    console.log(`\n--- Deactivating workflow ${workflowId} ---`);
    if (await agent.deactivateWorkflow(workflowId)) {
      console.log(`✓ Successfully deactivated workflow: ${workflowName}`);
    } else {
      console.log(`✗ Failed to deactivate workflow: ${workflowName}`);
    }

    // Show how to execute the workflow
    console.log(`\n--- Executing workflow ${workflowId} ---`);
    const executionResult = await agent.executeWorkflow(workflowId);
    if (executionResult) {
      console.log(`✓ Successfully executed workflow: ${workflowName}`);
      console.log(`  Execution ID: ${executionResult.id}`);
    } else {
      console.log(`✗ Failed to execute workflow: ${workflowName}`);
    }

    // Show how to get executions
    console.log(`\n--- Getting executions for workflow ${workflowId} ---`);
    const executions = await agent.getExecutions(workflowId, 5);
    if (executions) {
      console.log(`Found ${executions.length} executions:`);
      for (const execData of executions) {
        console.log(`  - ID: ${execData.id} | Status: ${execData.status}`);
      }
    } else {
      console.log('No executions found.');
    }

    // Option to delete the workflow (commented out to prevent accidental deletion)
    // console.log(`\n--- Deleting workflow ${workflowId} ---`);
    // if (await agent.deleteWorkflow(workflowId)) {
    //   console.log(`✓ Successfully deleted workflow: ${workflowName}`);
    // } else {
    //   console.log(`✗ Failed to delete workflow: ${workflowName}`);
    // }
  } else {
    console.log('✗ Failed to create workflow');
  }
}

async function main(): Promise<void> {
  await createExampleWorkflow();
}

// Run main function if executed directly
if (require.main === module) {
  main();
}

export { createExampleWorkflow };
