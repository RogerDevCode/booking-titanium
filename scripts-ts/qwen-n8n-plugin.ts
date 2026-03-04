#!/usr/bin/env tsx
/**
 * N8N Plugin for Qwen
 * This plugin allows Qwen to interact with your n8n instance
 * @migration-source scripts-py/qwen_n8n_plugin.py
 */

import { N8NCrudAgent } from './n8n_crud_agent';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

/**
 * Action result interface
 */
interface ActionResult {
  success: boolean;
  data?: any;
  count?: number;
  error?: string;
  supported_actions?: string[];
}

/**
 * N8N Plugin class for Qwen
 * Provides methods to interact with n8n from Qwen
 */
class N8NPlugin {
  private agent: N8NCrudAgent;

  /**
   * Initialize the plugin with n8n configuration
   * @param api_url - URL of the n8n instance
   * @param api_key - API key for authentication
   */
  constructor(api_url: string = 'https://n8n.stax.ink', api_key?: string) {
    this.agent = new N8NCrudAgent(api_url, api_key);
  }

  /**
   * Execute a specific action in n8n
   * @param action - The action to execute (list_workflows, create_workflow, etc.)
   * @param params - Additional parameters for the action
   * @returns Result of the action as a dictionary
   */
  async executeAction(action: string, params: Record<string, any> = {}): Promise<ActionResult> {
    try {
      switch (action) {
        case 'list_workflows':
          return this.listWorkflows(params);
        case 'list_active_workflows':
          return this.listActiveWorkflows(params);
        case 'get_workflow_by_id':
          return this.getWorkflowById(params);
        case 'create_workflow':
          return this.createWorkflow(params);
        case 'update_workflow':
          return this.updateWorkflow(params);
        case 'delete_workflow':
          return this.deleteWorkflow(params);
        case 'activate_workflow':
          return this.activateWorkflow(params);
        case 'deactivate_workflow':
          return this.deactivateWorkflow(params);
        case 'publish_workflow':
          return this.publishWorkflow(params);
        case 'unpublish_workflow':
          return this.unpublishWorkflow(params);
        case 'execute_workflow':
          return this.executeWorkflow(params);
        case 'get_executions':
          return this.getExecutions(params);
        case 'get_execution_by_id':
          return this.getExecutionById(params);
        default:
          return {
            success: false,
            error: `Unknown action: ${action}`,
            supported_actions: [
              'list_workflows',
              'list_active_workflows',
              'get_workflow_by_id',
              'create_workflow',
              'update_workflow',
              'delete_workflow',
              'activate_workflow',
              'deactivate_workflow',
              'publish_workflow',
              'unpublish_workflow',
              'execute_workflow',
              'get_executions',
              'get_execution_by_id',
            ],
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Error executing action ${action}: ${error.message}`,
      };
    }
  }

  private async listWorkflows(_params: Record<string, any> = {}): Promise<ActionResult> {
    /** List all workflows */
    const workflows = await this.agent.listWorkflows();
    return {
      success: workflows !== null,
      data: workflows || [],
      count: workflows?.length || 0,
    };
  }

  private async listActiveWorkflows(_params: Record<string, any> = {}): Promise<ActionResult> {
    /** List only active workflows */
    const workflows = await this.agent.listActiveWorkflows();
    return {
      success: workflows !== null,
      data: workflows || [],
      count: workflows?.length || 0,
    };
  }

  private async getWorkflowById(params: Record<string, any>): Promise<ActionResult> {
    /** Get a specific workflow by ID */
    const workflowId = params.workflow_id;
    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }

    const workflow = await this.agent.getWorkflowById(workflowId);
    return {
      success: workflow !== null,
      data: workflow,
    };
  }

  private async createWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Create a new workflow */
    const workflowData = params.workflow_data;
    if (!workflowData) {
      return { success: false, error: 'workflow_data is required' };
    }

    const created = await this.agent.createWorkflow(workflowData);
    return {
      success: created !== null,
      data: created,
    };
  }

  private async updateWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Update an existing workflow */
    const workflowId = params.workflow_id;
    const workflowData = params.workflow_data;

    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }
    if (!workflowData) {
      return { success: false, error: 'workflow_data is required' };
    }

    const updated = await this.agent.updateWorkflow(workflowId, workflowData);
    return {
      success: updated !== null,
      data: updated,
    };
  }

  private async deleteWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Delete a workflow */
    const workflowId = params.workflow_id;
    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }

    const success = await this.agent.deleteWorkflow(workflowId);
    return {
      success,
    };
  }

  private async activateWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Activate a workflow */
    const workflowId = params.workflow_id;
    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }

    const success = await this.agent.activateWorkflow(workflowId);
    return {
      success,
    };
  }

  private async deactivateWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Deactivate a workflow */
    const workflowId = params.workflow_id;
    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }

    const success = await this.agent.deactivateWorkflow(workflowId);
    return {
      success,
    };
  }

  private async publishWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Publish a workflow (alias for activate) */
    const workflowId = params.workflow_id;
    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }

    const success = await this.agent.publishWorkflow(workflowId);
    return {
      success,
    };
  }

  private async unpublishWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Unpublish a workflow (alias for deactivate) */
    const workflowId = params.workflow_id;
    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }

    const success = await this.agent.unpublishWorkflow(workflowId);
    return {
      success,
    };
  }

  private async executeWorkflow(params: Record<string, any>): Promise<ActionResult> {
    /** Execute a workflow manually */
    const workflowId = params.workflow_id;
    if (!workflowId) {
      return { success: false, error: 'workflow_id is required' };
    }

    const result = await this.agent.executeWorkflow(workflowId);
    return {
      success: result !== null,
      data: result,
    };
  }

  private async getExecutions(params: Record<string, any>): Promise<ActionResult> {
    /** Get executions for a workflow */
    const workflowId = params.workflow_id;
    const limit = params.limit || 10;

    const executions = await this.agent.getExecutions(workflowId, limit);
    return {
      success: executions !== null,
      data: executions || [],
      count: executions?.length || 0,
    };
  }

  private async getExecutionById(params: Record<string, any>): Promise<ActionResult> {
    /** Get a specific execution by ID */
    const executionId = params.execution_id;
    if (!executionId) {
      return { success: false, error: 'execution_id is required' };
    }

    const execution = await this.agent.getExecutionById(executionId);
    return {
      success: execution !== null,
      data: execution,
    };
  }
}

/**
 * Convenience function for Qwen to call directly
 * @param action - The action to execute
 * @param params - Parameters for the action
 * @returns Result serialized as JSON string
 */
async function qwenN8nPlugin(
  action: string,
  params: Record<string, any> = {}
): Promise<string> {
  const plugin = new N8NPlugin();
  const result = await plugin.executeAction(action, params);
  return JSON.stringify(result, null, 2);
}

/**
 * Example usage
 */
async function main() {
  // Example of how to use the plugin
  console.log('N8N Plugin for Qwen');
  console.log('Example usage:');

  // List workflows
  const result = await qwenN8nPlugin('list_workflows');
  console.log(`List workflows: ${result}`);

  // Activate a workflow (example)
  // const result = await qwenN8nPlugin('activate_workflow', { workflow_id: 'some_id' });
  // console.log(`Activate workflow: ${result}`);

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

export { N8NPlugin, qwenN8nPlugin };
