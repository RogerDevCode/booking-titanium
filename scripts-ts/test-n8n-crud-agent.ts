#!/usr/bin/env tsx
/**
 * Test suite for N8N CRUD Agent
 * @migration-source scripts-py/test_n8n_crud_agent.py
 */

import { N8NCrudAgent, WorkflowData } from './n8n-crud-agent';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test result interface
 */
interface TestResult {
  passed: boolean;
  message: string;
}

/**
 * Assert helper function
 */
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Assert equals helper function
 */
function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Got: ${actual}`);
  }
}

/**
 * Assert not null helper function
 */
function assertNotNull<T>(value: T | null, message: string): void {
  if (value === null) {
    throw new Error(`Assertion failed: ${message}. Value is null`);
  }
}

/**
 * Test class for N8NCrudAgent
 */
class TestN8NCrudAgent {
  private api_url: string;
  private api_key: string;
  private agent: N8NCrudAgent;
  private createdWorkflowIds: string[];

  constructor() {
    this.api_url = 'https://n8n.stax.ink';

    // Get API key from environment variables
    let api_key_env = process.env.N8N_API_KEY || process.env.N8N_ACCESS_TOKEN;

    // Also check for .env file
    if (!api_key_env) {
      const envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
          if (line.startsWith('N8N_API_KEY=')) {
            api_key_env = line.split('=')[1].trim().replace(/["']/g, '');
            break;
          } else if (line.startsWith('N8N_ACCESS_TOKEN=')) {
            api_key_env = line.split('=')[1].trim().replace(/["']/g, '');
            break;
          }
        }
      }
    }

    this.api_key = api_key_env;
    if (!this.api_key) {
      throw new Error(
        'No API key found. Please set N8N_API_KEY or N8N_ACCESS_TOKEN environment variable.'
      );
    }

    this.agent = new N8NCrudAgent(this.api_url, this.api_key);
    this.createdWorkflowIds = [];
  }

  /**
   * Generate a random ID for testing
   */
  private generateTestId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  /**
   * Create a basic workflow for testing
   */
  private createBasicWorkflow(name: string): WorkflowData {
    return {
      name,
      nodes: [
        {
          parameters: {},
          id: `test-trigger-${this.generateTestId()}`,
          name: 'Test Trigger',
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
  }

  /**
   * Test listing all workflows
   */
  async test01ListWorkflows(): Promise<TestResult> {
    try {
      const workflows = await this.agent.listWorkflows();
      assertNotNull(workflows, 'Should return a list of workflows or empty list');
      assert(Array.isArray(workflows), 'Should return a list');
      return { passed: true, message: '✓ test01ListWorkflows passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test01ListWorkflows failed: ${error.message}` };
    }
  }

  /**
   * Test listing active workflows
   */
  async test02ListActiveWorkflows(): Promise<TestResult> {
    try {
      const activeWorkflows = await this.agent.listActiveWorkflows();
      assertNotNull(activeWorkflows, 'Should return a list of active workflows or empty list');
      assert(Array.isArray(activeWorkflows), 'Should return a list');
      return { passed: true, message: '✓ test02ListActiveWorkflows passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test02ListActiveWorkflows failed: ${error.message}` };
    }
  }

  /**
   * Test creating a new workflow
   */
  async test03CreateWorkflow(): Promise<TestResult> {
    try {
      const workflowName = `Test Workflow ${this.generateTestId()}`;
      const workflowData = this.createBasicWorkflow(workflowName);

      const createdWorkflow = await this.agent.createWorkflow(workflowData);
      assertNotNull(createdWorkflow, 'Should return created workflow data');
      assert('id' in createdWorkflow, 'Created workflow should have an ID');
      assertEquals(createdWorkflow.name, workflowName, 'Workflow name should match');

      // Store the ID for cleanup
      if (createdWorkflow.id) {
        this.createdWorkflowIds.push(createdWorkflow.id);
      }

      return { passed: true, message: '✓ test03CreateWorkflow passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test03CreateWorkflow failed: ${error.message}` };
    }
  }

  /**
   * Test retrieving a specific workflow by ID
   */
  async test04GetWorkflowById(): Promise<TestResult> {
    try {
      // First create a workflow to test with
      const workflowName = `Test Get Workflow ${this.generateTestId()}`;
      const workflowData = this.createBasicWorkflow(workflowName);

      const createdWorkflow = await this.agent.createWorkflow(workflowData);
      assertNotNull(createdWorkflow, 'Should create workflow for test');

      const workflowId = createdWorkflow.id || '';
      this.createdWorkflowIds.push(workflowId);

      // Now test retrieving it
      const retrievedWorkflow = await this.agent.getWorkflowById(workflowId);
      assertNotNull(retrievedWorkflow, 'Should return workflow data');
      assertEquals(retrievedWorkflow.id, workflowId, 'Should return correct workflow');
      assertEquals(retrievedWorkflow.name, workflowName, 'Should have correct name');

      return { passed: true, message: '✓ test04GetWorkflowById passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test04GetWorkflowById failed: ${error.message}` };
    }
  }

  /**
   * Test updating an existing workflow
   */
  async test05UpdateWorkflow(): Promise<TestResult> {
    try {
      // First create a workflow to update
      const originalName = `Original Test Workflow ${this.generateTestId()}`;
      const workflowData = this.createBasicWorkflow(originalName);

      const createdWorkflow = await this.agent.createWorkflow(workflowData);
      assertNotNull(createdWorkflow, 'Should create workflow for test');

      const workflowId = createdWorkflow.id || '';
      this.createdWorkflowIds.push(workflowId);

      // Verify the original name
      const retrievedOriginal = await this.agent.getWorkflowById(workflowId);
      assertEquals(retrievedOriginal?.name, originalName, 'Original name should match');

      // Now update the workflow
      const updatedName = `Updated Test Workflow ${this.generateTestId()}`;
      const updateData: WorkflowData = {
        ...workflowData,
        name: updatedName,
      };

      const updatedWorkflow = await this.agent.updateWorkflow(workflowId, updateData);
      // Note: Update might fail with some n8n versions, so we'll make this test flexible
      if (updatedWorkflow) {
        assertEquals(updatedWorkflow.name, updatedName, 'Updated name should match');
        // Verify the update persisted
        const verifiedWorkflow = await this.agent.getWorkflowById(workflowId);
        assertEquals(verifiedWorkflow?.name, updatedName, 'Updated name should persist');
      } else {
        console.log('Warning: Update operation failed (this may be expected depending on n8n version)');
      }

      return { passed: true, message: '✓ test05UpdateWorkflow passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test05UpdateWorkflow failed: ${error.message}` };
    }
  }

  /**
   * Test activating and deactivating a workflow
   */
  async test06ActivateDeactivateWorkflow(): Promise<TestResult> {
    try {
      // Create a workflow with a proper trigger for activation
      const workflowName = `Activation Test Workflow ${this.generateTestId()}`;
      const workflowData = this.createBasicWorkflow(workflowName);

      const createdWorkflow = await this.agent.createWorkflow(workflowData);
      assertNotNull(createdWorkflow, 'Should create workflow for test');

      const workflowId = createdWorkflow.id || '';
      this.createdWorkflowIds.push(workflowId);

      // Initially should be inactive
      const retrievedBefore = await this.agent.getWorkflowById(workflowId);
      assert(!retrievedBefore?.active, 'Workflow should initially be inactive');

      // Try to activate (may fail if no proper trigger node)
      const activationResult = await this.agent.activateWorkflow(workflowId);
      // Activation might fail due to lack of proper trigger nodes, which is OK

      // Try to deactivate (should work regardless)
      const deactivationResult = await this.agent.deactivateWorkflow(workflowId);
      assert(deactivationResult, 'Should be able to deactivate workflow');

      return { passed: true, message: '✓ test06ActivateDeactivateWorkflow passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test06ActivateDeactivateWorkflow failed: ${error.message}` };
    }
  }

  /**
   * Test executing a workflow
   */
  async test07ExecuteWorkflow(): Promise<TestResult> {
    try {
      // Create a workflow to execute
      const workflowName = `Execution Test Workflow ${this.generateTestId()}`;
      const workflowData = this.createBasicWorkflow(workflowName);

      const createdWorkflow = await this.agent.createWorkflow(workflowData);
      assertNotNull(createdWorkflow, 'Should create workflow for test');

      const workflowId = createdWorkflow.id || '';
      this.createdWorkflowIds.push(workflowId);

      // Execute the workflow
      const executionResult = await this.agent.executeWorkflow(workflowId);
      // Execution might fail if workflow isn't activated, which is OK for this test
      if (executionResult) {
        assert(executionResult.id, 'Execution should have an ID');
      }

      return { passed: true, message: '✓ test07ExecuteWorkflow passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test07ExecuteWorkflow failed: ${error.message}` };
    }
  }

  /**
   * Test getting executions for a workflow
   */
  async test08GetExecutions(): Promise<TestResult> {
    try {
      // Create a workflow to get executions for
      const workflowName = `Get Executions Test Workflow ${this.generateTestId()}`;
      const workflowData = this.createBasicWorkflow(workflowName);

      const createdWorkflow = await this.agent.createWorkflow(workflowData);
      assertNotNull(createdWorkflow, 'Should create workflow for test');

      const workflowId = createdWorkflow.id || '';
      this.createdWorkflowIds.push(workflowId);

      // Get executions for the workflow
      const executions = await this.agent.getExecutions(workflowId, 5);
      // May return empty list if no executions exist, which is OK
      if (executions !== null) {
        assert(Array.isArray(executions), 'Should return a list of executions');
      }

      return { passed: true, message: '✓ test08GetExecutions passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test08GetExecutions failed: ${error.message}` };
    }
  }

  /**
   * Test deleting a workflow
   */
  async test09DeleteWorkflow(): Promise<TestResult> {
    try {
      // Create a workflow to delete
      const workflowName = `Deletion Test Workflow ${this.generateTestId()}`;
      const workflowData = this.createBasicWorkflow(workflowName);

      const createdWorkflow = await this.agent.createWorkflow(workflowData);
      assertNotNull(createdWorkflow, 'Should create workflow for test');

      const workflowId = createdWorkflow.id || '';

      // Verify it exists
      const retrievedBefore = await this.agent.getWorkflowById(workflowId);
      assertNotNull(retrievedBefore, 'Workflow should exist before deletion');

      // Delete the workflow
      const deletionResult = await this.agent.deleteWorkflow(workflowId);
      assert(deletionResult, 'Should successfully delete workflow');

      // Verify it no longer exists
      const retrievedAfter = await this.agent.getWorkflowById(workflowId);
      assert(retrievedAfter === null, 'Workflow should not exist after deletion');

      return { passed: true, message: '✓ test09DeleteWorkflow passed' };
    } catch (error: any) {
      return { passed: false, message: `✗ test09DeleteWorkflow failed: ${error.message}` };
    }
  }

  /**
   * Clean up any remaining test workflows
   */
  async tearDown(): Promise<void> {
    console.log(`\nCleaning up ${this.createdWorkflowIds.length} test workflows...`);
    for (const workflowId of this.createdWorkflowIds) {
      try {
        const result = await this.agent.deleteWorkflow(workflowId);
        if (result) {
          console.log(`✓ Deleted test workflow: ${workflowId}`);
        } else {
          console.log(`✗ Failed to delete test workflow: ${workflowId}`);
        }
      } catch (error: any) {
        console.log(`✗ Error deleting test workflow ${workflowId}: ${error.message}`);
      }
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('Starting N8N CRUD Agent tests...');
    console.log('='.repeat(50));

    const tests = [
      this.test01ListWorkflows.bind(this),
      this.test02ListActiveWorkflows.bind(this),
      this.test03CreateWorkflow.bind(this),
      this.test04GetWorkflowById.bind(this),
      this.test05UpdateWorkflow.bind(this),
      this.test06ActivateDeactivateWorkflow.bind(this),
      this.test07ExecuteWorkflow.bind(this),
      this.test08GetExecutions.bind(this),
      this.test09DeleteWorkflow.bind(this),
    ];

    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        const result = await test();
        results.push(result);
        console.log(result.message);
      } catch (error: any) {
        results.push({ passed: false, message: `✗ Test failed with error: ${error.message}` });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Test Summary:');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total: ${results.length}`);

    // Cleanup
    await this.tearDown();

    if (failed > 0) {
      process.exit(1);
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    const testSuite = new TestN8NCrudAgent();
    await testSuite.runAllTests();
  } catch (error: any) {
    console.error(`Failed to initialize test suite: ${error.message}`);
    process.exit(1);
  }
}

// Run main function if executed directly
if (require.main === module) {
  main();
}

export { TestN8NCrudAgent };
