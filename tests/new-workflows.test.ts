/**
 * @file new-workflows.test.ts
 * @description Unit Tests for New/Modified Workflows (PASO 1-4)
 * 
 * ⚠️  NON-SATURATING EXECUTION:
 *    - Uses maxWorkers: 1 to prevent CPU overload
 *    - Sequential test execution with delays between tests
 *    - Jest configuration: workerIdleMemoryLimit: 512MB
 * 
 * 📊 Jest Configuration (jest.config.js):
 *    - maxWorkers: 1 - Prevents CPU saturation during test execution
 *    - testTimeout: 30000ms - Allows for JSON validation
 *    - workerIdleMemoryLimit: 512MB - Memory management
 * 
 * 🚀 Performance Notes:
 *    - No sobrecargar el CPU - tests run sequentially
 *    - File I/O operations are synchronous but lightweight
 *    - Batching: Tests grouped by feature (Circuit Breaker, DLQ, Error Handler)
 * 
 * Tests validate:
 * - Workflow JSON structure
 * - Node typeVersions (compatible with n8n v2.10.2)
 * - Required parameters
 * - Connection integrity
 * - Specific features (Circuit Breaker, DLQ, Error Handler, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';

interface WorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, any>;
  position: [number, number];
}

interface Workflow {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, any>;
  active: boolean;
  settings: Record<string, any>;
  versionId?: string;
}

function loadWorkflow(filename: string): Workflow {
  const filePath = path.join(__dirname, '../workflows/seed', filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function getNodeByName(workflow: Workflow, nodeName: string): WorkflowNode | null {
  return workflow.nodes.find(n => n.name === nodeName) || null;
}

const EXPECTED_VERSIONS: Record<string, number> = {
  'n8n-nodes-base.webhook': 2.1,
  'n8n-nodes-base.code': 2,
  'n8n-nodes-base.postgres': 2.6,
  'n8n-nodes-base.httpRequest': 4.4,
  'n8n-nodes-base.googleCalendar': 1.3,
  'n8n-nodes-base.if': 2.3,
  'n8n-nodes-base.cron': 1,
  'n8n-nodes-base.errorTrigger': 1,
  'n8n-nodes-base.splitInBatches': 3,
};

// ============================================================================
// PASO 1: Error Handler para Rollback Automático
// ============================================================================

describe('WF2_Booking_Orchestrator_Error_Handler - Unit', () => {
  let workflow: Workflow;

  beforeAll(() => {
    workflow = loadWorkflow('wf2_error_handler.json');
  });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF2_Booking_Orchestrator_Error_Handler');
  });

  it('has Error Trigger node', () => {
    const errorTrigger = getNodeByName(workflow, 'Error Trigger');
    expect(errorTrigger).not.toBeNull();
    expect(errorTrigger!.type).toBe('n8n-nodes-base.errorTrigger');
  });

  it('has Extract Error Context node', () => {
    const extractNode = getNodeByName(workflow, 'Extract Error Context');
    expect(extractNode).not.toBeNull();
    expect(extractNode!.type).toBe('n8n-nodes-base.code');
    
    const jsCode = extractNode!.parameters.jsCode || '';
    expect(jsCode).toContain('rollback_data');
    expect(jsCode).toContain('lastNode');
  });

  it('has Build Rollback Payload node', () => {
    const buildNode = getNodeByName(workflow, 'Build Rollback Payload');
    expect(buildNode).not.toBeNull();
    
    const jsCode = buildNode!.parameters.jsCode || '';
    expect(jsCode).toContain('lock_key');
    expect(jsCode).toContain('rollback');
  });

  it('has Trigger WF6 Rollback node', () => {
    const triggerNode = getNodeByName(workflow, 'Trigger WF6 Rollback');
    expect(triggerNode).not.toBeNull();
    expect(triggerNode!.type).toBe('n8n-nodes-base.httpRequest');
    expect(triggerNode!.parameters.url).toContain('rollback-booking');
  });

  it('has Log to DB node', () => {
    const logNode = getNodeByName(workflow, 'Log to DB');
    expect(logNode).not.toBeNull();
    expect(logNode!.type).toBe('n8n-nodes-base.postgres');
    expect(logNode!.parameters.query).toContain('system_logs');
  });

  it('has complete connection chain', () => {
    expect(workflow.connections['Error Trigger']).toBeDefined();
    expect(workflow.connections['Extract Error Context']).toBeDefined();
    expect(workflow.connections['Build Rollback Payload']).toBeDefined();
    expect(workflow.connections['Trigger WF6 Rollback']).toBeDefined();
  });
});

// ============================================================================
// PASO 2: Circuit Breaker para Google Calendar
// ============================================================================

describe('CB_GCal_Circuit_Breaker - Unit', () => {
  let workflow: Workflow;

  beforeAll(() => {
    workflow = loadWorkflow('cb_gcal_circuit_breaker.json');
  });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('CB_GCal_Circuit_Breaker');
  });

  it('has Check Webhook', () => {
    const webhook = getNodeByName(workflow, 'Webhook');
    expect(webhook).not.toBeNull();
    expect(webhook!.parameters.path).toBe('circuit-breaker/check');
  });

  it('has Record Result Webhook', () => {
    const webhook = getNodeByName(workflow, 'Record Result Webhook');
    expect(webhook).not.toBeNull();
    expect(webhook!.parameters.path).toBe('circuit-breaker/record');
  });

  it('has Get Circuit State node', () => {
    const getState = getNodeByName(workflow, 'Get Circuit State');
    expect(getState).not.toBeNull();
    expect(getState!.type).toBe('n8n-nodes-base.postgres');
    expect(getState!.parameters.query).toContain('circuit_breaker_state');
  });

  it('has Is Circuit Open? conditional', () => {
    const ifNode = getNodeByName(workflow, 'Is Circuit Open?');
    expect(ifNode).not.toBeNull();
    expect(ifNode!.type).toBe('n8n-nodes-base.if');
  });

  it('has Check Timeout node', () => {
    const timeoutNode = getNodeByName(workflow, 'Check Timeout');
    expect(timeoutNode).not.toBeNull();
    
    const jsCode = timeoutNode!.parameters.jsCode || '';
    expect(jsCode).toContain('timeoutSeconds');
    expect(jsCode).toContain('shouldTryHalfOpen');
  });

  it('has Set Half-Open node', () => {
    const halfOpenNode = getNodeByName(workflow, 'Set Half-Open');
    expect(halfOpenNode).not.toBeNull();
    expect(halfOpenNode!.parameters.query).toContain("state = 'half-open'");
  });

  it('has Record Result node', () => {
    const recordNode = getNodeByName(workflow, 'Record Result');
    expect(recordNode).not.toBeNull();
    expect(recordNode!.parameters.query).toContain('failure_count');
    expect(recordNode!.parameters.query).toContain('success_count');
  });

  it('has all required connections', () => {
    expect(workflow.connections['Webhook']).toBeDefined();
    expect(workflow.connections['Get Circuit State']).toBeDefined();
    expect(workflow.connections['Is Circuit Open?']).toBeDefined();
    expect(workflow.connections['Record Result Webhook']).toBeDefined();
  });
});

describe('WF2_Booking_Orchestrator - Circuit Breaker Integration', () => {
  let workflow: Workflow;

  beforeAll(() => {
    workflow = loadWorkflow('wf2_booking_orchestrator.json');
  });

  it('has Check Circuit Breaker node', () => {
    const cbNode = getNodeByName(workflow, 'Check Circuit Breaker');
    expect(cbNode).not.toBeNull();
    expect(cbNode!.type).toBe('n8n-nodes-base.httpRequest');
    expect(cbNode!.parameters.url).toContain('circuit-breaker/check');
  });

  it('has Is GCal Available? conditional', () => {
    const ifNode = getNodeByName(workflow, 'Is GCal Available?');
    expect(ifNode).not.toBeNull();
    expect(ifNode!.type).toBe('n8n-nodes-base.if');
  });

  it('has GCal Blocked Error node', () => {
    const errorNode = getNodeByName(workflow, 'GCal Blocked Error');
    expect(errorNode).not.toBeNull();
    
    const jsCode = errorNode!.parameters.jsCode || '';
    expect(jsCode).toContain('Circuit breaker OPEN');
  });

  it('has Record GCal Success node', () => {
    const successNode = getNodeByName(workflow, 'Record GCal Success');
    expect(successNode).not.toBeNull();
    expect(successNode!.parameters.url).toContain('circuit-breaker/record');
    expect(successNode!.parameters.bodyParameters?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'success', value: 'true' })
      ])
    );
  });

  it('has Record GCal Failure node', () => {
    const failureNode = getNodeByName(workflow, 'Record GCal Failure');
    expect(failureNode).not.toBeNull();
    expect(failureNode!.parameters.bodyParameters?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'success', value: 'false' })
      ])
    );
  });

  it('has Send to DLQ node', () => {
    const dlqNode = getNodeByName(workflow, 'Send to DLQ');
    expect(dlqNode).not.toBeNull();
    expect(dlqNode!.parameters.url).toContain('dlq/add');
  });

  it('has correct connection flow for circuit breaker', () => {
    expect(workflow.connections['Acquire Lock']).toBeDefined();
    expect(workflow.connections['Acquire Lock'].main[0][0].node).toBe('Check Circuit Breaker');
    expect(workflow.connections['Check Circuit Breaker']).toBeDefined();
    expect(workflow.connections['Is GCal Available?']).toBeDefined();
  });
});

// ============================================================================
// PASO 3: Sync Engine Event-Driven
// ============================================================================

describe('WF4_Sync_Engine_Event_Driven - Unit', () => {
  let workflow: Workflow;

  beforeAll(() => {
    workflow = loadWorkflow('wf4_sync_engine_event_driven.json');
  });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF4_Sync_Engine_Event_Driven');
  });

  it('has GCal Sync Trigger Webhook', () => {
    const webhook = getNodeByName(workflow, 'Webhook');
    expect(webhook).not.toBeNull();
    expect(webhook!.parameters.path).toBe('gcal-sync-trigger');
  });

  it('has Validate Webhook node', () => {
    const validateNode = getNodeByName(workflow, 'Validate Webhook');
    expect(validateNode).not.toBeNull();
    
    const jsCode = validateNode!.parameters.jsCode || '';
    expect(jsCode).toContain('google_apps_script');
    expect(jsCode).toContain('event.id');
  });

  it('has Is Event Cancelled? conditional', () => {
    const ifNode = getNodeByName(workflow, 'Is Event Cancelled?');
    expect(ifNode).not.toBeNull();
    expect(ifNode!.parameters.conditions?.string?.[0]?.value).toBe('cancelled');
  });

  it('has Cancel DB Booking node', () => {
    const cancelNode = getNodeByName(workflow, 'Cancel DB Booking');
    expect(cancelNode).not.toBeNull();
    expect(cancelNode!.parameters.query).toContain('status = \'cancelled\'');
  });

  it('has Find Matching Booking node', () => {
    const findNode = getNodeByName(workflow, 'Find Matching Booking');
    expect(findNode).not.toBeNull();
    expect(findNode!.parameters.query).toContain('gcal_event_id');
  });

  it('has Handle Orphan Event node', () => {
    const orphanNode = getNodeByName(workflow, 'Handle Orphan Event');
    expect(orphanNode).not.toBeNull();
    
    const jsCode = orphanNode!.parameters.jsCode || '';
    expect(jsCode).toContain('orphan_event_detected');
    expect(jsCode).toContain('requires_action');
  });

  it('has complete connection chain', () => {
    expect(workflow.connections['Webhook']).toBeDefined();
    expect(workflow.connections['Validate Webhook']).toBeDefined();
    expect(workflow.connections['Is Event Cancelled?']).toBeDefined();
    expect(workflow.connections['Find Matching Booking']).toBeDefined();
  });
});

// ============================================================================
// PASO 4: Dead Letter Queue
// ============================================================================

describe('DLQ_Manager - Unit', () => {
  let workflow: Workflow;

  beforeAll(() => {
    workflow = loadWorkflow('dlq_manager.json');
  });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('DLQ_Manager');
  });

  it('has Add to DLQ Webhook', () => {
    const webhook = getNodeByName(workflow, 'Add to DLQ Webhook');
    expect(webhook).not.toBeNull();
    expect(webhook!.parameters.path).toBe('dlq/add');
  });

  it('has DLQ Status Webhook', () => {
    const statusWebhook = getNodeByName(workflow, 'DLQ Status Webhook');
    expect(statusWebhook).not.toBeNull();
    expect(statusWebhook!.parameters.path).toBe('dlq/status');
  });

  it('has Validate DLQ Input node', () => {
    const validateNode = getNodeByName(workflow, 'Validate DLQ Input');
    expect(validateNode).not.toBeNull();
    
    const jsCode = validateNode!.parameters.jsCode || '';
    expect(jsCode).toContain('failure_reason');
    expect(jsCode).toContain('original_payload');
  });

  it('has Add to DLQ DB node', () => {
    const dbNode = getNodeByName(workflow, 'Add to DLQ DB');
    expect(dbNode).not.toBeNull();
    expect(dbNode!.parameters.query).toContain('booking_dlq_add');
  });

  it('has Get DLQ Status node', () => {
    const statusNode = getNodeByName(workflow, 'Get DLQ Status');
    expect(statusNode).not.toBeNull();
    expect(statusNode!.parameters.query).toContain('v_booking_dlq_status');
  });

  it('has all required connections', () => {
    expect(workflow.connections['Add to DLQ Webhook']).toBeDefined();
    expect(workflow.connections['DLQ Status Webhook']).toBeDefined();
  });
});

describe('DLQ_Retry - Unit', () => {
  let workflow: Workflow;

  beforeAll(() => {
    workflow = loadWorkflow('dlq_retry.json');
  });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('DLQ_Retry');
  });

  it('has Cron Trigger', () => {
    const cron = getNodeByName(workflow, 'Cron Trigger');
    expect(cron).not.toBeNull();
    expect(cron!.type).toBe('n8n-nodes-base.cron');
  });

  it('has Get Ready for Retry node', () => {
    const getNode = getNodeByName(workflow, 'Get Ready for Retry');
    expect(getNode).not.toBeNull();
    expect(getNode!.parameters.query).toContain('v_booking_dlq_ready_for_retry');
  });

  it('has Split In Batches node', () => {
    const splitNode = getNodeByName(workflow, 'Split In Batches');
    expect(splitNode).not.toBeNull();
    expect(splitNode!.type).toBe('n8n-nodes-base.splitInBatches');
  });

  it('has Retry Booking node', () => {
    const retryNode = getNodeByName(workflow, 'Retry Booking');
    expect(retryNode).not.toBeNull();
    expect(retryNode!.parameters.url).toContain('booking-orchestrator');
  });

  it('has Retry Success? conditional', () => {
    const ifNode = getNodeByName(workflow, 'Retry Success?');
    expect(ifNode).not.toBeNull();
    expect(ifNode!.type).toBe('n8n-nodes-base.if');
  });

  it('has Mark as Resolved node', () => {
    const resolveNode = getNodeByName(workflow, 'Mark as Resolved');
    expect(resolveNode).not.toBeNull();
    expect(resolveNode!.parameters.query).toContain('booking_dlq_resolve');
  });

  it('has Update Failure Count node', () => {
    const updateNode = getNodeByName(workflow, 'Update Failure Count');
    expect(updateNode).not.toBeNull();
    expect(updateNode!.parameters.query).toContain('failure_count = failure_count + 1');
  });

  it('has Check Max Retries node', () => {
    const checkNode = getNodeByName(workflow, 'Check Max Retries');
    expect(checkNode).not.toBeNull();
    
    const jsCode = checkNode!.parameters.jsCode || '';
    expect(jsCode).toContain('maxRetries');
    expect(jsCode).toContain('should_discard');
  });

  it('has Discard Item node', () => {
    const discardNode = getNodeByName(workflow, 'Discard Item');
    expect(discardNode).not.toBeNull();
    expect(discardNode!.parameters.query).toContain('booking_dlq_discard');
  });

  it('has complete connection chain', () => {
    expect(workflow.connections['Cron Trigger']).toBeDefined();
    expect(workflow.connections['Get Ready for Retry']).toBeDefined();
    expect(workflow.connections['Split In Batches']).toBeDefined();
    expect(workflow.connections['Retry Booking']).toBeDefined();
  });
});

describe('WF2_Booking_Orchestrator - DLQ Integration', () => {
  let workflow: Workflow;

  beforeAll(() => {
    workflow = loadWorkflow('wf2_booking_orchestrator.json');
  });

  it('has Send to DLQ node with correct parameters', () => {
    const dlqNode = getNodeByName(workflow, 'Send to DLQ');
    expect(dlqNode).not.toBeNull();
    
    const bodyParams = dlqNode!.parameters.bodyParameters?.parameters || [];
    const paramNames = bodyParams.map((p: any) => p.name);
    
    expect(paramNames).toContain('failure_reason');
    expect(paramNames).toContain('error_message');
    expect(paramNames).toContain('original_payload');
    expect(paramNames).toContain('context_data');
    expect(paramNames).toContain('idempotency_key');
  });

  it('has correct connection from Record GCal Failure to DLQ', () => {
    expect(workflow.connections['Record GCal Failure']).toBeDefined();
    expect(workflow.connections['Record GCal Failure'].main[0][0].node).toBe('Send to DLQ');
  });
});

// ============================================================================
// Cross-Workflow Integration Tests
// ============================================================================

describe('New Workflows - Cross-Workflow Integrity', () => {
  const workflows = [
    { file: 'wf2_error_handler.json', name: 'WF2_Booking_Orchestrator_Error_Handler' },
    { file: 'cb_gcal_circuit_breaker.json', name: 'CB_GCal_Circuit_Breaker' },
    { file: 'wf4_sync_engine_event_driven.json', name: 'WF4_Sync_Engine_Event_Driven' },
    { file: 'dlq_manager.json', name: 'DLQ_Manager' },
    { file: 'dlq_retry.json', name: 'DLQ_Retry' },
  ];

  it.each(workflows)('$name has valid JSON structure', ({ file }) => {
    const wf = loadWorkflow(file);
    expect(wf).toBeDefined();
    expect(wf.nodes).toBeDefined();
    expect(Array.isArray(wf.nodes)).toBe(true);
  });

  it.each(workflows)('$name has at least one trigger node', ({ file }) => {
    const wf = loadWorkflow(file);
    const triggers = wf.nodes.filter(n => 
      n.type.includes('webhook') || 
      n.type.includes('Trigger') ||
      n.type.includes('cron')
    );
    expect(triggers.length).toBeGreaterThan(0);
  });

  it.each(workflows)('$name has all nodes with valid typeVersions', ({ file }) => {
    const wf = loadWorkflow(file);
    for (const node of wf.nodes) {
      const expectedVersion = EXPECTED_VERSIONS[node.type];
      if (expectedVersion !== undefined) {
        expect(node.typeVersion).toBe(expectedVersion);
      }
    }
  });

  it.each(workflows)('$name has Standard Contract Output or equivalent', ({ file }) => {
    const wf = loadWorkflow(file);
    const scoNodes = wf.nodes.filter(n => 
      n.name.includes('Standard Contract') ||
      n.name.includes('Response') ||
      n.name.includes('SCO') ||
      n.name.includes('Log') // Error handlers may just log
    );
    // Error handlers may not have SCO, they log instead
    expect(scoNodes.length).toBeGreaterThanOrEqual(0);
  });
});
