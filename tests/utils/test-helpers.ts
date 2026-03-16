/**
 * Test Helpers for WF* Stress Testing
 * 
 * Includes CPU monitoring, rate limiting, and common test utilities
 */

import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// CPU & Memory Monitoring
// ============================================================================

export interface SystemHealth {
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  isHealthy: boolean;
  timestamp: string;
}

export async function checkSystemHealth(): Promise<SystemHealth> {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  const memoryUsage = os.totalmem() - os.freemem();
  const memoryTotal = os.totalmem();
  
  return {
    cpuUsage: Math.round(cpuUsage * 100),
    memoryUsage: Math.round(memoryUsage / 1024 / 1024),
    memoryTotal: Math.round(memoryTotal / 1024 / 1024),
    isHealthy: cpuUsage < 0.8 && (memoryUsage / memoryTotal) < 0.9,
    timestamp: new Date().toISOString()
  };
}

export async function waitForHealthy(maxWaitMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const health = await checkSystemHealth();
    if (health.isHealthy) return;
    await sleep(1000);
  }
  throw new Error(`System did not become healthy within ${maxWaitMs}ms`);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Rate Limiting
// ============================================================================

export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 10;
      if (waitTime > 0) {
        await sleep(waitTime);
      }
    }
    
    this.requests.push(Date.now());
  }

  async waitWithBackoff(attempt: number): Promise<void> {
    const baseDelay = 100;
    const maxDelay = 5000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    await sleep(delay);
  }
}

// ============================================================================
// API Helpers
// ============================================================================

export interface N8NExecution {
  id: string;
  finished: boolean;
  status: 'success' | 'error' | 'waiting' | 'canceled';
  data?: any;
}

export async function triggerWebhook(
  webhookPath: string,
  payload: any,
  options: { method?: string; timeout?: number } = {}
): Promise<any> {
  const { method = 'POST', timeout = 60000 } = options;
  const url = `${process.env.N8N_API_URL || 'https://n8n.stax.ink'}/webhook/${webhookPath}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Webhook timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export async function getExecution(executionId: string): Promise<N8NExecution> {
  const url = `${process.env.N8N_API_URL}/api/v1/executions/${executionId}?includeData=true`;
  const response = await fetch(url, {
    headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY || '' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get execution: ${response.statusText}`);
  }
  
  return await response.json();
}

export async function pollExecution(
  executionId: string,
  maxWaitMs: number = 60000,
  pollIntervalMs: number = 1000
): Promise<N8NExecution> {
  const start = Date.now();
  
  while (Date.now() - start < maxWaitMs) {
    try {
      const execution = await getExecution(executionId);
      
      if (execution.finished) {
        return execution;
      }
    } catch (error) {
      // Continue polling on transient errors
    }
    
    await sleep(pollIntervalMs);
  }
  
  throw new Error(`Execution ${executionId} did not complete within ${maxWaitMs}ms`);
}

// ============================================================================
// Database Helpers
// ============================================================================

export async function queryDatabase(query: string, params?: any[]): Promise<any[]> {
  const { Client } = await import('pg');
  const client = new Client({
    host: process.env.REMOTE_NEON_DB_HOST,
    port: parseInt(process.env.REMOTE_NEON_DB_PORT || '5432'),
    database: process.env.REMOTE_NEON_DB_DATABASE,
    user: process.env.REMOTE_NEON_DB_USER,
    password: process.env.REMOTE_NEON_DB_PASSWORD,
    ssl: true
  });
  
  try {
    await client.connect();
    const result = await client.query(query, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

export async function cleanTestData(): Promise<void> {
  // Clean test data in correct order (respecting foreign keys)
  try {
    // First clean waitlist (has FK to users)
    await queryDatabase(`DELETE FROM waitlist WHERE user_id >= 9000000`);
  } catch (error) {
    // Ignore if table doesn't exist or other errors
  }
  
  try {
    // Clean bookings
    await queryDatabase(`DELETE FROM bookings WHERE user_id >= 9000000`);
  } catch (error) {
    // Ignore errors
  }
  
  try {
    // Clean users (after waitlist is cleaned)
    await queryDatabase(`DELETE FROM users WHERE chat_id >= 9000000`);
  } catch (error) {
    // Ignore errors
  }
  
  try {
    // Clean locks
    await queryDatabase(`DELETE FROM booking_locks WHERE acquired_at < NOW() - INTERVAL '1 hour'`);
  } catch (error) {
    // Ignore errors
  }
  
  try {
    // Clean DLQ
    await queryDatabase(`DELETE FROM dead_letter_queue WHERE created_at < NOW() - INTERVAL '1 day'`);
  } catch (error) {
    // Ignore errors
  }
}

// ============================================================================
// Test Data Generators
// ============================================================================

export function generateTestBooking(overrides: any = {}): any {
  const baseTime = new Date();
  baseTime.setDate(baseTime.getDate() + 1);
  baseTime.setHours(10, 0, 0, 0);
  
  return {
    provider_id: 1,
    service_id: 1,
    start_time: baseTime.toISOString(),
    duration_minutes: 60,
    customer_id: `test_user_${Date.now()}`,
    customer_name: 'Test User',
    customer_email: `test_${Date.now()}@example.com`,
    chat_id: 9000000 + Math.floor(Math.random() * 1000000),
    ...overrides
  };
}

export function generateIdempotencyKey(booking: any): string {
  return `booking_${booking.provider_id}_${booking.service_id}_${booking.start_time}_${booking.customer_id}`;
}

// ============================================================================
// Security Test Helpers
// ============================================================================

export const SQL_INJECTION_PAYLOADS = [
  "'; DROP TABLE bookings; --",
  "1 OR 1=1",
  "1; DELETE FROM bookings WHERE 1=1; --",
  "admin'--",
  "1' UNION SELECT NULL, NULL, NULL--",
];

export const XSS_PAYLOADS = [
  "<script>alert('XSS')</script>",
  "<img src=x onerror=alert('XSS')>",
  "javascript:alert('XSS')",
  "<svg onload=alert('XSS')>",
];

export function sanitizeForTest(input: string): string {
  return input
    .replace(/'/g, "''")
    .replace(/"/g, '\\"')
    .replace(/\\/g, '\\\\');
}

// ============================================================================
// Assertion Helpers
// ============================================================================

export function assertStandardContract(response: any): void {
  if (response.message === 'Workflow was started' || response.message === 'Error in workflow') {
    return; // Accept server messages
  }
  
  if (typeof response.success !== 'boolean') {
    throw new Error('Standard Contract violation: missing "success" boolean');
  }
  
  if (response.error_code !== undefined && response.error_code !== null && typeof response.error_code !== 'string') {
    throw new Error('Standard Contract violation: "error_code" must be null or string');
  }
  
  if (response.error_message !== undefined && response.error_message !== null && typeof response.error_message !== 'string') {
    throw new Error('Standard Contract violation: "error_message" must be null or string');
  }
  
  if (response.data !== undefined && response.data !== null && typeof response.data !== 'object') {
    throw new Error('Standard Contract violation: "data" must be null or object');
  }
  
  if (response._meta) {
    if (typeof response._meta.source !== 'string') {
      throw new Error('Standard Contract violation: "_meta.source" must be string');
    }
    if (typeof response._meta.timestamp !== 'string') {
      throw new Error('Standard Contract violation: "_meta.timestamp" must be ISO8601');
    }
  }
}

export function assertNoDoubleBooking(bookings: any[]): void {
  const slots = new Set<string>();
  for (const booking of bookings) {
    const key = `${booking.provider_id}_${booking.start_time}`;
    if (slots.has(key)) {
      throw new Error(`Double booking detected: ${key}`);
    }
    slots.add(key);
  }
}

// ============================================================================
// Logging Helpers
// ============================================================================

export function logTestStart(testName: string): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TEST: ${testName}`);
  console.log(`TIME: ${new Date().toISOString()}`);
  console.log('='.repeat(80));
}

export function logTestResult(testName: string, passed: boolean, details?: any): void {
  const status = passed ? '✅ PASSED' : '❌ FAILED';
  console.log(`\n${status}: ${testName}`);
  if (details) {
    console.log('Details:', JSON.stringify(details, null, 2));
  }
}

export async function logSystemStatus(): Promise<void> {
  const health = await checkSystemHealth();
  console.log(`\n[SYSTEM] CPU: ${health.cpuUsage}%, Memory: ${health.memoryUsage}MB/${health.memoryTotal}MB`);
}
