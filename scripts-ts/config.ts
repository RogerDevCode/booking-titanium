/**
 * @file config.ts
 * @description Migrated from config.py - Centralized configuration for all n8n scripts
 * @migration-date 2026-02-22
 * @migration-tool Qwen 2.5 Coder
 * @requires-review YES — verify N8N node references and $vars
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Interface for N8N configuration options
 */
interface N8NConfigOptions {
  api_url?: string;
  api_key?: string;
  timeout?: number;
  verify_ssl?: boolean;
}

/**
 * Interface for workflow ID mappings
 */
interface WorkflowIdMapping {
  [key: string]: string;
}

/**
 * Known workflow IDs mapping
 */
export const WORKFLOW_IDS: Readonly<WorkflowIdMapping> = Object.freeze({
  BB_00_Global_Error_Handler: '_Za9GzqB2cS9HVwBglt43',
  BB_02_Security_Firewall: 'Rhn_gioVdn3Q3AeiyNPYg',
} as const);

/**
 * Load environment variables from .env file
 * Only sets variables that are NOT already defined in environment
 *
 * @param envPath - Path to .env file. Defaults to project root/.env (SSOT)
 */
export function loadEnvFile(envPath?: string): void {
  // Default to project root .env (single source of truth)
  const resolvedPath = envPath ?? path.join(__dirname, '../.env');

  if (!fs.existsSync(resolvedPath)) {
    return;
  }

  // Use dotenv to load .env file, but only for variables not already set
  const envConfig = dotenv.config({ path: resolvedPath });

  if (envConfig.parsed) {
    for (const [key, value] of Object.entries(envConfig.parsed)) {
      // Only set if NOT already in environment
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * N8N API Configuration class
 *
 * Reads configuration from (in order of priority):
 * 1. Parameters passed to constructor
 * 2. Environment variables (N8N_API_URL, N8N_API_KEY, N8N_ACCESS_TOKEN)
 * 3. .env file (only for variables not already in environment)
 */
export class N8NConfig {
  private readonly _apiUrl: string;
  private readonly _apiKey: string;
  private readonly _timeout: number;
  private readonly _verifySsl: boolean;

  constructor(options: N8NConfigOptions = {}) {
    // Load .env file (only for missing variables)
    loadEnvFile();

    const {
      api_url,
      api_key,
      timeout = 30,
      verify_ssl = true,
    } = options;

    // API URL: parameter > env var > default
    let apiUrl = api_url ?? process.env.N8N_API_URL ?? 'http://localhost:5678';
    apiUrl = apiUrl.replace(/\/$/, ''); // Strip trailing slash

    // Strip /api/v1 if already present to avoid duplication in base_endpoint
    if (apiUrl.endsWith('/api/v1')) {
      apiUrl = apiUrl.slice(0, -7);
    }

    // API Key: parameter > N8N_API_KEY > N8N_ACCESS_TOKEN
    const apiKey =
      api_key ?? process.env.N8N_API_KEY ?? process.env.N8N_ACCESS_TOKEN;

    if (!apiKey) {
      throw new Error(
        'N8N API Key not found. Options:\n' +
          '  1. Set N8N_API_KEY environment variable\n' +
          '  2. Set N8N_ACCESS_TOKEN environment variable\n' +
          '  3. Create .env file with N8N_API_KEY=your-key\n' +
          '  4. Pass api_key parameter in options'
      );
    }

    this._apiUrl = apiUrl;
    this._apiKey = apiKey;
    this._timeout = timeout;
    this._verifySsl = verify_ssl;
  }

  /**
   * Get API URL
   */
  get api_url(): string {
    return this._apiUrl;
  }

  /**
   * Get API Key
   */
  get api_key(): string {
    return this._apiKey;
  }

  /**
   * Get timeout in seconds
   */
  get timeout(): number {
    return this._timeout;
  }

  /**
   * Get SSL verification flag
   */
  get verify_ssl(): boolean {
    return this._verifySsl;
  }

  /**
   * Get HTTP headers for API requests
   */
  get headers(): Record<string, string> {
    return {
      'X-N8N-API-Key': this.api_key,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get base API endpoint
   */
  get base_endpoint(): string {
    return `${this.api_url}/api/v1`;
  }

  /**
   * Get workflow endpoint URL
   *
   * @param workflowId - Optional workflow ID for specific workflow endpoint
   * @returns Full workflow endpoint URL
   */
  workflow_endpoint(workflowId: string = ''): string {
    const path = workflowId ? `/workflows/${workflowId}` : '/workflows';
    return `${this.base_endpoint}${path}`;
  }

  /**
   * Get execution endpoint URL
   *
   * @param executionId - Optional execution ID for specific execution endpoint
   * @returns Full execution endpoint URL
   */
  execution_endpoint(executionId: string = ''): string {
    const path = executionId ? `/executions/${executionId}` : '/executions';
    return `${this.base_endpoint}${path}`;
  }
}

/**
 * Workflows directory path (resolved to absolute path)
 */
export const WORKFLOWS_DIR: string = path.resolve(
  __dirname,
  '..',
  'workflows'
);

/**
 * Default configuration instance (lazy initialization)
 */
let defaultConfig: N8NConfig | null = null;

/**
 * Get default N8N configuration (singleton pattern)
 *
 * @returns Default N8NConfig instance
 */
export function getDefaultConfig(): N8NConfig {
  if (!defaultConfig) {
    defaultConfig = new N8NConfig();
  }
  return defaultConfig;
}
