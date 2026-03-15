
import axios from 'axios';
import { N8NConfig } from './config';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  header: (msg: string) => console.log(`\n${COLORS.cyan}=== ${msg} ===${COLORS.reset}`),
  success: (msg: string) => console.log(`${COLORS.green}✓ ${msg}${COLORS.reset}`),
  error: (msg: string) => console.log(`${COLORS.red}✗ ${msg}${COLORS.reset}`),
  info: (msg: string) => console.log(`${COLORS.blue}i ${msg}${COLORS.reset}`),
  warn: (msg: string) => console.log(`${COLORS.yellow}! ${msg}${COLORS.reset}`)
};

async function runTests() {
  const config = new N8NConfig();
  const baseUrl = config.api_url.replace('/api/v1', '');
  const timestamp = Date.now();
  
  log.header('STARTING SEED WORKFLOW TESTS');
  log.info(`n8n URL: ${baseUrl}`);

  try {
    // 1. TEST CB_GCal_Circuit_Breaker
    log.header('TESTING: CB_GCal_Circuit_Breaker');
    const cbCheck = await axios.post(`${baseUrl}/webhook/circuit-breaker/check`, {
      service_id: 'google_calendar'
    });
    if (cbCheck.data.success) {
      log.success(`Circuit state: ${cbCheck.data.data.circuit_state}`);
    }

    // 2. TEST DLQ_Manager
    log.header('TESTING: DLQ_Manager');
    const dlqAdd = await axios.post(`${baseUrl}/webhook/dlq/add`, {
      failure_reason: `test_failure_${timestamp}`,
      original_payload: { test: true, ts: timestamp },
      chat_id: 12345678,
      provider_id: 1,
      service_id: 1
    });
    if (dlqAdd.data.success) {
      log.success(`Item added to DLQ. ID: ${dlqAdd.data.data.dlq_id}`);
    }

    // 3. TEST WF7_Distributed_Lock_System
    log.header('TESTING: WF7_Distributed_Lock_System');
    const lockAcquire = await axios.post(`${baseUrl}/webhook/acquire-lock`, {
      provider_id: 1,
      start_time: `2026-03-15T${new Date().getHours()}:00:00Z`
    });
    if (lockAcquire.data.success) {
      log.success(`Lock result: ${JSON.stringify(lockAcquire.data.data)}`);
    } else {
      log.error(`Lock failed: ${JSON.stringify(lockAcquire.data)}`);
    }

    // 4. TEST WF6_Rollback_Workflow
    log.header('TESTING: WF6_Rollback_Workflow');
    const rollback = await axios.post(`${baseUrl}/webhook/rollback-booking`, {
      lock_key: lockAcquire.data.data.lock_key,
      reason: 'integration_test_cleanup'
    });
    if (rollback.data.success) {
      log.success(`Rollback result: ${JSON.stringify(rollback.data.data.steps_executed)}`);
    }

    // 5. TEST WF2_Booking_Orchestrator (E2E)
    log.header('TESTING: WF2_Booking_Orchestrator (E2E)');
    const orchestrator = await axios.post(`${baseUrl}/webhook/booking-orchestrator`, {
      provider_id: 1,
      service_id: 1,
      start_time: `2026-04-01T10:00:00Z`,
      customer_id: `user_${timestamp}`,
      chat_id: timestamp
    });
    
    if (orchestrator.data.success) {
      log.success(`Orchestrator Success! Booking ID: ${orchestrator.data.data.booking_id}`);
      if (orchestrator.data.data.is_duplicate) {
        log.warn('NOTE: This was detected as a DUPLICATE');
      }
    } else {
      log.error(`Orchestrator Error: ${orchestrator.data.error_message}`);
    }

    log.header('ALL TESTS COMPLETED');

  } catch (error: any) {
    log.error(`Test suite failed: ${error.message}`);
    if (error.response && error.response.data) {
      console.log(JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTests();
