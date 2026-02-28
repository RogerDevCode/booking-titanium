#!/usr/bin/env tsx
/**
 * N8N CRUD Agent - Performs Create, Read, Update, Delete operations on n8n workflows
 * @migration-source scripts-py/n8n_crud_agent.py
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Get API key from environment variables or .env file
 * Priority:
 * 1. Environment variables (N8N_API_KEY or N8N_ACCESS_TOKEN)
 * 2. .env file in script directory
 * @returns API key
 * @throws Error if no API key is found
 */
export function getApiKey(): string {
  // First try to get from environment variables
  let apiKey = process.env.N8N_API_KEY || process.env.N8N_ACCESS_TOKEN;

  // If not in environment, look in .env file
  if (!apiKey) {
    const envPath = path.join(__dirname, '.env');

    if (fs.existsSync(envPath)) {
      const envConfig = dotenv.config({ path: envPath });

      if (envConfig.parsed) {
        apiKey = envConfig.parsed.N8N_API_KEY || envConfig.parsed.N8N_ACCESS_TOKEN;
      }
    }
  }

  // If still no API key found, show error and exit
  if (!apiKey) {
    console.error('Error: No API key found in N8N_API_KEY or N8N_ACCESS_TOKEN environment variables.');
    console.error('Please set one of these environment variables or create a .env file with N8N_API_KEY or N8N_ACCESS_TOKEN');
    process.exit(1);
  }

  return apiKey;
}

/**
 * Workflow data interface
 */
export interface WorkflowData {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, any>;
  settings?: Record<string, any>;
  active?: boolean;
  id?: string;
  [key: string]: any;
}

/**
 * Workflow node interface
 */
export interface WorkflowNode {
  parameters: Record<string, any>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  [key: string]: any;
}

/**
 * Execution data interface
 */
export interface ExecutionData {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  mode: string;
  workflowId?: string;
  [key: string]: any;
}

/**
 * N8N CRUD Agent class for workflow management
 */
export class N8NCrudAgent {
  private api_url: string;
  private api_key: string;
  private client: AxiosInstance;

  /**
   * Initialize the N8N CRUD Agent
   * @param api_url - Base URL of the n8n instance
   * @param api_key - API key for authentication (optional, will use getApiKey() if not provided)
   */
  constructor(api_url: string, api_key?: string) {
    this.api_url = api_url.replace(/\/$/, ''); // Remove trailing slash
    this.api_key = api_key || getApiKey();

    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: this.api_url,
      headers: {
        'X-N8N-API-Key': this.api_key,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds timeout
    });
  }

  /**
   * Retrieve all workflows from n8n instance
   * @returns List of workflows or null if error occurs
   */
  async listWorkflows(): Promise<WorkflowData[] | null> {
    try {
      const response: AxiosResponse<{ data: WorkflowData[] }> = await this.client.get('/api/v1/workflows');

      if (response.status === 200) {
        return response.data.data;
      } else {
        console.error(`Error retrieving workflows: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieve all active workflows from n8n instance
   * @returns List of active workflows or null if error occurs
   */
  async listActiveWorkflows(): Promise<WorkflowData[] | null> {
    try {
      const response: AxiosResponse<{ data: WorkflowData[] }> = await this.client.get('/api/v1/workflows');

      if (response.status === 200) {
        const workflows = response.data.data;
        // Filter for active workflows only
        return workflows.filter((wf) => wf.active === true);
      } else {
        console.error(`Error retrieving workflows: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieve a specific workflow by ID
   * @param workflow_id - ID of the workflow to retrieve
   * @returns Workflow data or null if error occurs
   */
  async getWorkflowById(workflow_id: string): Promise<WorkflowData | null> {
    try {
      const response: AxiosResponse<WorkflowData> = await this.client.get(`/api/v1/workflows/${workflow_id}`);

      if (response.status === 200) {
        return response.data;
      } else {
        console.error(`Error retrieving workflow ${workflow_id}: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a new workflow in n8n
   * @param workflow_data - Dictionary containing workflow definition
   * @returns Created workflow data or null if error occurs
   */
  async createWorkflow(workflow_data: WorkflowData): Promise<WorkflowData | null> {
    try {
      const response: AxiosResponse<WorkflowData> = await this.client.post('/api/v1/workflows', workflow_data);

      if (response.status === 200 || response.status === 201) {
        return response.data;
      } else {
        console.error(`Error creating workflow: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }

  /**
   * Update an existing workflow in n8n
   * @param workflow_id - ID of the workflow to update
   * @param workflow_data - Dictionary containing updated workflow definition
   * @returns Updated workflow data or null if error occurs
   */
  async updateWorkflow(workflow_id: string, workflow_data: WorkflowData): Promise<WorkflowData | null> {
    try {
      // Try PUT method first
      let response: AxiosResponse<WorkflowData> = await this.client.put(
        `/api/v1/workflows/${workflow_id}`,
        workflow_data
      );

      if (response.status === 200) {
        return response.data;
      } else if (response.status === 405) {
        // Method not allowed - try PATCH as fallback
        response = await this.client.patch(
          `/api/v1/workflows/${workflow_id}`,
          workflow_data
        );

        if (response.status === 200) {
          return response.data;
        } else {
          console.error(`Error updating workflow ${workflow_id} with PATCH: ${response.status} - ${response.statusText}`);
          return null;
        }
      } else {
        console.error(`Error updating workflow ${workflow_id} with PUT: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a workflow from n8n
   * @param workflow_id - ID of the workflow to delete
   * @returns True if deletion was successful, false otherwise
   */
  async deleteWorkflow(workflow_id: string): Promise<boolean> {
    try {
      const response: AxiosResponse = await this.client.delete(`/api/v1/workflows/${workflow_id}`);

      if (response.status === 200) {
        return true;
      } else {
        console.error(`Error deleting workflow ${workflow_id}: ${response.status} - ${response.statusText}`);
        return false;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return false;
    }
  }

  /**
   * Activate a workflow in n8n (publish the workflow)
   * @param workflow_id - ID of the workflow to activate
   * @returns True if activation was successful, false otherwise
   */
  async activateWorkflow(workflow_id: string): Promise<boolean> {
    try {
      const response: AxiosResponse = await this.client.post(`/api/v1/workflows/${workflow_id}/activate`);

      if (response.status === 200) {
        return true;
      } else if (response.status === 400) {
        // Check if it's because there's no trigger node
        const errorData = response.data as any;
        console.error(`Error activating workflow ${workflow_id}: ${errorData?.message || response.statusText}`);
        return false;
      } else {
        console.error(`Error activating workflow ${workflow_id}: ${response.status} - ${response.statusText}`);
        return false;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return false;
    }
  }

  /**
   * Deactivate a workflow in n8n (unpublish the workflow)
   * @param workflow_id - ID of the workflow to deactivate
   * @returns True if deactivation was successful, false otherwise
   */
  async deactivateWorkflow(workflow_id: string): Promise<boolean> {
    try {
      const response: AxiosResponse = await this.client.post(`/api/v1/workflows/${workflow_id}/deactivate`);

      if (response.status === 200) {
        return true;
      } else {
        console.error(`Error deactivating workflow ${workflow_id}: ${response.status} - ${response.statusText}`);
        return false;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return false;
    }
  }

  /**
   * Publish a workflow (alias for activateWorkflow)
   * @param workflow_id - ID of the workflow to publish
   * @returns True if publishing was successful, false otherwise
   */
  async publishWorkflow(workflow_id: string): Promise<boolean> {
    return this.activateWorkflow(workflow_id);
  }

  /**
   * Unpublish a workflow (alias for deactivateWorkflow)
   * @param workflow_id - ID of the workflow to unpublish
   * @returns True if unpublishing was successful, false otherwise
   */
  async unpublishWorkflow(workflow_id: string): Promise<boolean> {
    return this.deactivateWorkflow(workflow_id);
  }

  /**
   * Execute a workflow manually in n8n
   * @param workflow_id - ID of the workflow to execute
   * @returns Execution result or null if error occurs
   */
  async executeWorkflow(workflow_id: string): Promise<Record<string, any> | null> {
    try {
      const response: AxiosResponse<Record<string, any>> = await this.client.post(
        `/api/v1/workflows/${workflow_id}/run`
      );

      if (response.status === 200) {
        return response.data;
      } else {
        console.error(`Error executing workflow ${workflow_id}: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }

  /**
   * Get executions for a specific workflow or all workflows
   * @param workflow_id - ID of the workflow (optional, gets all if not provided)
   * @param limit - Maximum number of executions to return
   * @returns List of executions or null if error occurs
   */
  async getExecutions(workflow_id?: string, limit: number = 10): Promise<ExecutionData[] | null> {
    try {
      let url: string;

      if (workflow_id) {
        url = `/api/v1/executions?filter=${JSON.stringify({ workflowId: workflow_id })}&limit=${limit}`;
      } else {
        url = `/api/v1/executions?limit=${limit}`;
      }

      const response: AxiosResponse<{ data: ExecutionData[] }> = await this.client.get(url);

      if (response.status === 200) {
        return response.data.data;
      } else {
        console.error(`Error retrieving executions: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }

  /**
   * Get a specific execution by ID
   * @param execution_id - ID of the execution to retrieve
   * @returns Execution data or null if error occurs
   */
  async getExecutionById(execution_id: string): Promise<ExecutionData | null> {
    try {
      const response: AxiosResponse<ExecutionData> = await this.client.get(`/api/v1/executions/${execution_id}`);

      if (response.status === 200) {
        return response.data;
      } else {
        console.error(`Error retrieving execution ${execution_id}: ${response.status} - ${response.statusText}`);
        return null;
      }
    } catch (error: any) {
      console.error(`Error connecting to n8n: ${error.message}`);
      return null;
    }
  }
}

/**
 * Main function for standalone execution
 */
async function main() {
  // Configuration
  const API_URL = 'https://n8n.stax.ink';

  // Initialize the agent (will use N8N_ACCESS_TOKEN automatically)
  const agent = new N8NCrudAgent(API_URL);

  console.log('N8N CRUD Agent initialized');
  console.log(`Connected to: ${API_URL}`);

  // Example operations
  console.log('\n--- Available Operations ---');
  console.log('1. List all workflows');
  console.log('2. List active workflows');
  console.log('3. Get workflow by ID');
  console.log('4. Create a new workflow');
  console.log('5. Update a workflow');
  console.log('6. Delete a workflow');
  console.log('7. Activate a workflow');
  console.log('8. Deactivate a workflow');
  console.log('9. Execute a workflow');
  console.log('10. Get executions');

  // Example: List all workflows
  console.log('\n--- Listing all workflows ---');
  const workflows = await agent.listWorkflows();
  if (workflows) {
    console.log(`Found ${workflows.length} workflow(s):`);
    for (const wf of workflows) {
      const status = wf.active ? 'ACTIVE' : 'INACTIVE';
      console.log(`  - ID: ${wf.id} | Name: ${wf.name} | Status: ${status}`);
    }
  } else {
    console.log('No workflows found or error occurred.');
  }

  // Example: List active workflows
  console.log('\n--- Listing active workflows ---');
  const activeWorkflows = await agent.listActiveWorkflows();
  if (activeWorkflows) {
    console.log(`Found ${activeWorkflows.length} active workflow(s):`);
    for (const wf of activeWorkflows) {
      console.log(`  - ID: ${wf.id} | Name: ${wf.name}`);
    }
  } else {
    console.log('No active workflows found.');
  }
}

// Run main function if executed directly
if (require.main === module) {
  main();
}
