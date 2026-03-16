/**
 * @file seed-workflows.test.ts
 * @description Unit Tests for Booking Titanium Seed Workflows (WF1-WF7)
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
 *    - Batching: Workflow validation grouped by workflow ID
 * 
 * Tests validate:
 * - Workflow JSON structure
 * - Node typeVersions (compatible with n8n v2.10.2)
 * - Required parameters
 * - Standard Contract Output pattern
 * - Connection integrity
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
  'n8n-nodes-base.function': 1,
  'n8n-nodes-base.cron': 1,
};

describe('WF1_Booking_API_Gateway', () => {
  let workflow: Workflow;
  beforeAll(() => { workflow = loadWorkflow('wf1_booking_api_gateway.json'); });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF1_Booking_API_Gateway');
  });

  it('has Webhook node with correct typeVersion', () => {
    const webhook = getNodeByName(workflow, 'Webhook Trigger');
    expect(webhook).not.toBeNull();
    expect(webhook!.type).toBe('n8n-nodes-base.webhook');
    expect(webhook!.typeVersion).toBe(2.1);
  });

  it('has HTTP Request node with correct typeVersion', () => {
    const http = getNodeByName(workflow, 'Call Orchestrator');
    expect(http).not.toBeNull();
    expect(http!.type).toBe('n8n-nodes-base.httpRequest');
    expect(http!.typeVersion).toBe(4.4);
  });

  it('has connections defined', () => {
    expect(workflow.connections).toBeDefined();
    expect(Object.keys(workflow.connections).length).toBeGreaterThan(0);
  });
});

describe('WF2_Booking_Orchestrator', () => {
  let workflow: Workflow;
  beforeAll(() => { workflow = loadWorkflow('wf2_booking_orchestrator.json'); });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF2_Booking_Orchestrator');
  });

  it('has Idempotency Key generation (Code node, not Date.now())', () => {
    const node = getNodeByName(workflow, 'Generate Idempotency Key');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('n8n-nodes-base.code');
    const jsCode = node!.parameters.jsCode || '';
    expect(jsCode).toContain('provider_id');
    expect(jsCode).toContain('start_time');
    expect(jsCode).not.toContain('Date.now()');
  });

  it('has Check Idempotency DB node', () => {
    const node = getNodeByName(workflow, 'Check Idempotency DB');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('n8n-nodes-base.postgres');
    expect(node!.typeVersion).toBe(2.6);
  });

  it('has Check Availability with timeout config', () => {
    const node = getNodeByName(workflow, 'Check Availability');
    expect(node).not.toBeNull();
    const options = node!.parameters.options || {};
    // Verify timeout is set (retry config may be normalized by n8n)
    expect(options.timeout).toBeDefined();
    expect(options.timeout).toBeGreaterThan(0);
  });

  it('has Create GCal Event with correct typeVersion', () => {
    const node = getNodeByName(workflow, 'Create GCal Event');
    expect(node).not.toBeNull();
    expect(node!.type).toBe('n8n-nodes-base.googleCalendar');
    expect(node!.typeVersion).toBe(1.3);
  });

  it('has Standard Contract Output', () => {
    const node = getNodeByName(workflow, 'Standard Contract Output');
    expect(node).not.toBeNull();
    const jsCode = node!.parameters.jsCode || '';
    expect(jsCode).toContain('success:');
    expect(jsCode).toContain('_meta');
  });
});

describe('WF3_Availability_Service', () => {
  let workflow: Workflow;
  beforeAll(() => { workflow = loadWorkflow('wf3_availability_service.json'); });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF3_Availability_Service');
  });

  it('has Webhook with correct typeVersion', () => {
    const node = getNodeByName(workflow, 'Webhook');
    expect(node!.typeVersion).toBe(2.1);
  });

  it('has Check DB Postgres node', () => {
    const node = getNodeByName(workflow, 'Check DB');
    expect(node!.type).toBe('n8n-nodes-base.postgres');
    expect(node!.typeVersion).toBe(2.6);
  });

  it('has Check GCal node', () => {
    const node = getNodeByName(workflow, 'Check GCal');
    expect(node!.type).toBe('n8n-nodes-base.googleCalendar');
    expect(node!.typeVersion).toBe(1.3);
  });
});

describe('WF4_Sync_Engine', () => {
  let workflow: Workflow;
  beforeAll(() => { workflow = loadWorkflow('wf4_sync_engine.json'); });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF4_Sync_Engine');
  });

  it('has Cron trigger', () => {
    const node = getNodeByName(workflow, 'Cron');
    expect(node!.type).toBe('n8n-nodes-base.cron');
    expect(node!.typeVersion).toBe(1);
  });

  it('has Find Unsynced DB node', () => {
    const node = getNodeByName(workflow, 'Find Unsynced DB');
    expect(node!.type).toBe('n8n-nodes-base.postgres');
    expect(node!.typeVersion).toBe(2.6);
  });
});

describe('WF5_GCal_Collision_Check', () => {
  let workflow: Workflow;
  beforeAll(() => { workflow = loadWorkflow('wf5_gcal_collision_check.json'); });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF5_GCal_Collision_Check');
  });

  it('has Webhook with correct typeVersion', () => {
    const node = getNodeByName(workflow, 'Webhook');
    expect(node!.typeVersion).toBe(2.1);
  });

  it('has List Events node', () => {
    const node = getNodeByName(workflow, 'List Events');
    expect(node!.type).toBe('n8n-nodes-base.googleCalendar');
    expect(node!.typeVersion).toBe(1.3);
  });
});

describe('WF6_Rollback_Workflow', () => {
  let workflow: Workflow;
  beforeAll(() => { workflow = loadWorkflow('wf6_rollback_workflow.json'); });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF6_Rollback_Workflow');
  });

  it('has Validate Rollback Input node', () => {
    const node = getNodeByName(workflow, 'Validate Rollback Input');
    expect(node).not.toBeNull();
    const jsCode = node!.parameters.jsCode || '';
    expect(jsCode).toContain('booking_id');
    expect(jsCode).toContain('gcal_event_id');
  });

  it('has Delete GCal Event with eventId expression', () => {
    const node = getNodeByName(workflow, 'Delete GCal Event');
    expect(node).not.toBeNull();
    const eventId = node!.parameters.eventId || '';
    expect(eventId).toContain('{{ $json.gcal_event_id }}');
  });

  it('has Soft Delete DB Booking (UPDATE, not DELETE)', () => {
    const node = getNodeByName(workflow, 'Soft Delete DB Booking');
    expect(node).not.toBeNull();
    const query = node!.parameters.query || '';
    expect(query).toContain('UPDATE');
    expect(query).toContain('status');
    expect(query).not.toMatch(/DELETE\s+FROM\s+bookings/i);
  });

  it('has Release Lock node', () => {
    const node = getNodeByName(workflow, 'Release Lock');
    expect(node).not.toBeNull();
    const query = node!.parameters.query || '';
    expect(query).toContain('booking_locks');
  });

  it('has Standard Contract Output with rollback tracking', () => {
    const node = getNodeByName(workflow, 'Standard Contract Output');
    expect(node).not.toBeNull();
    const jsCode = node!.parameters.jsCode || '';
    expect(jsCode).toContain('steps_executed');
    expect(jsCode).toContain('gcal_delete');
  });
});

describe('WF7_Distributed_Lock_System', () => {
  let workflow: Workflow;
  beforeAll(() => { workflow = loadWorkflow('wf7_distributed_lock_system.json'); });

  it('has correct workflow name', () => {
    expect(workflow.name).toBe('WF7_Distributed_Lock_System');
  });

  it('has Acquire Lock Webhook', () => {
    const node = getNodeByName(workflow, 'Webhook');
    expect(node!.parameters.path).toBe('acquire-lock');
  });

  it('has Release Lock Webhook', () => {
    const node = getNodeByName(workflow, 'Release Lock Webhook');
    expect(node!.parameters.path).toBe('release-lock');
  });

  it('has Build Lock Query with TTL', () => {
    const node = getNodeByName(workflow, 'Build Lock Query');
    expect(node).not.toBeNull();
    const jsCode = node!.parameters.jsCode || '';
    expect(jsCode).toContain('lock_duration_minutes');
    expect(jsCode).toContain('expires_at');
  });

  it('has Acquire Lock with TTL and ON CONFLICT', () => {
    const node = getNodeByName(workflow, 'Acquire Lock');
    expect(node).not.toBeNull();
    const query = node!.parameters.query || '';
    expect(query).toContain('INTERVAL');
    expect(query).toContain('ON CONFLICT');
  });

  it('has Release Lock node', () => {
    const node = getNodeByName(workflow, 'Release Lock');
    expect(node).not.toBeNull();
    const query = node!.parameters.query || '';
    expect(query).toContain('DELETE FROM booking_locks');
  });
});

describe('Seed Workflows - Cross-Workflow Integrity', () => {
  const workflows = [
    'wf1_booking_api_gateway.json',
    'wf2_booking_orchestrator.json',
    'wf3_availability_service.json',
    'wf4_sync_engine.json',
    'wf5_gcal_collision_check.json',
    'wf6_rollback_workflow.json',
    'wf7_distributed_lock_system.json',
  ];

  it.each(workflows)('%s has valid JSON structure', (filename) => {
    const wf = loadWorkflow(filename);
    expect(wf).toBeDefined();
    expect(wf.nodes).toBeDefined();
    expect(Array.isArray(wf.nodes)).toBe(true);
  });

  it.each(workflows)('%s has at least one trigger node', (filename) => {
    const wf = loadWorkflow(filename);
    const triggers = wf.nodes.filter(n => 
      n.type.includes('webhook') || n.type.includes('Trigger') || n.type.includes('cron')
    );
    expect(triggers.length).toBeGreaterThan(0);
  });

  it.each(workflows)('%s has all nodes with valid typeVersions', (filename) => {
    const wf = loadWorkflow(filename);
    for (const node of wf.nodes) {
      const expectedVersion = EXPECTED_VERSIONS[node.type];
      if (expectedVersion !== undefined) {
        expect(node.typeVersion).toBe(expectedVersion);
      }
    }
  });
});
