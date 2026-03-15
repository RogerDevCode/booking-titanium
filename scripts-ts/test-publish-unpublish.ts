#!/usr/bin/env tsx
/**
 * Test script to verify the new publish/unpublish functionality
 * @migration-source scripts-py/test_publish_unpublish.py
 */

import { N8NCrudAgent, WorkflowData } from './n8n_crud_agent';
import * as fs from 'fs';
import * as path from 'path';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

/**
 * Test the publish/unpublish functionality
 */
async function testPublishUnpublish(): Promise<void> {
  // Configuration
  const API_URL = 'https://n8n.stax.ink';

  // Get API key from environment variables
  let API_KEY = process.env.N8N_API_KEY || process.env.N8N_ACCESS_TOKEN;

  // Also check for .env file
  if (!API_KEY) {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      for (const line of envContent.split('\n')) {
        if (line.startsWith('N8N_API_KEY=')) {
          API_KEY = line.split('=')[1].trim().replace(/["']/g, '');
          break;
        } else if (line.startsWith('N8N_ACCESS_TOKEN=')) {
          API_KEY = line.split('=')[1].trim().replace(/["']/g, '');
          break;
        }
      }
    }
  }

  if (!API_KEY) {
    console.error(
      'Error: No API key found. Please set N8N_API_KEY or N8N_ACCESS_TOKEN environment variable.'
    );
    return;
  }

  // Initialize the agent
  const agent = new N8NCrudAgent(API_URL, API_KEY);

  console.log('=== Testing Publish/Unpublish Functionality ===\n');

  // First, let's create a new workflow to test with
  console.log('--- Creating a new workflow for testing ---');
  const newWorkflow: WorkflowData = {
    name: 'Publish/Unpublish Test Workflow',
    nodes: [
      {
        parameters: {},
        id: 'test-trigger-node',
        name: 'Test Trigger',
        type: 'n8n-nodes-base.scheduleTrigger', // Using schedule trigger for activation
        typeVersion: 1,
        position: [240, 300] as [number, number],
      },
    ],
    connections: {},
    settings: {
      saveManualExecutions: true,
    },
  };

  const createdWorkflow = await agent.createWorkflow(newWorkflow);
  if (!createdWorkflow) {
    console.log('✗ Failed to create workflow for testing');
    return;
  }

  const workflowId = createdWorkflow.id || '';
  const workflowName = createdWorkflow.name || '';
  console.log(`✓ Created workflow: '${workflowName}' with ID: ${workflowId}`);

  // Verify initial state (should be inactive)
  console.log(`\n--- Verifying initial state ---`);
  const initialState = await agent.getWorkflowById(workflowId);
  if (initialState) {
    const isActive = initialState.active || false;
    console.log(`Initial state: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
  }

  // Test publish using the new method
  console.log(`\n--- Testing publishWorkflow() ---`);
  const publishResult = await agent.publishWorkflow(workflowId);
  if (publishResult) {
    console.log('✓ publishWorkflow() succeeded');
    // Verify state after publishing
    const afterPublish = await agent.getWorkflowById(workflowId);
    if (afterPublish) {
      const isActive = afterPublish.active || false;
      console.log(`State after publish: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
    }
  } else {
    console.log('✗ publishWorkflow() failed');
  }

  // Test unpublish using the new method
  console.log(`\n--- Testing unpublishWorkflow() ---`);
  const unpublishResult = await agent.unpublishWorkflow(workflowId);
  if (unpublishResult) {
    console.log('✓ unpublishWorkflow() succeeded');
    // Verify state after unpublishing
    const afterUnpublish = await agent.getWorkflowById(workflowId);
    if (afterUnpublish) {
      const isActive = afterUnpublish.active || false;
      console.log(`State after unpublish: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
    }
  } else {
    console.log('✗ unpublishWorkflow() failed');
  }

  // Test that publish/unpublish are aliases for activate/deactivate
  console.log(`\n--- Testing that publish/unpublish are aliases ---`);
  // Activate using activateWorkflow
  const activateResult = await agent.activateWorkflow(workflowId);
  if (activateResult) {
    console.log('✓ activateWorkflow() succeeded');
  }

  // Deactivate using deactivateWorkflow
  const deactivateResult = await agent.deactivateWorkflow(workflowId);
  if (deactivateResult) {
    console.log('✓ deactivateWorkflow() succeeded');
  }

  // Compare results
  if (publishResult === activateResult) {
    console.log('✓ publishWorkflow() behaves the same as activateWorkflow()');
  } else {
    console.log('✗ publishWorkflow() behaves differently than activateWorkflow()');
  }

  if (unpublishResult === deactivateResult) {
    console.log('✓ unpublishWorkflow() behaves the same as deactivateWorkflow()');
  } else {
    console.log('✗ unpublishWorkflow() behaves differently than deactivateWorkflow()');
  }

  console.log(`\n--- Testing new execution functionality ---`);
  // Execute the workflow
  const executionResult = await agent.executeWorkflow(workflowId);
  if (executionResult) {
    console.log('✓ executeWorkflow() succeeded');
    console.log(`  Execution ID: ${executionResult.id}`);
  } else {
    console.log('✗ executeWorkflow() failed');
  }

  // Get executions
  const executions = await agent.getExecutions(workflowId, 5);
  if (executions) {
    console.log(`✓ getExecutions() succeeded, found ${executions.length} executions`);
  } else {
    console.log('✗ getExecutions() failed');
  }

  console.log(`\n--- Cleanup: Keeping workflow for inspection ---`);
  console.log(
    `The test workflow '${workflowName}' (ID: ${workflowId}) remains in your n8n instance`
  );

  console.log(`\n=== Publish/Unpublish Functionality Test Complete ===`);
}

async function main(): Promise<void> {
  await testPublishUnpublish();
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

export { testPublishUnpublish };
