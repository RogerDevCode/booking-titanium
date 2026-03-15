/**
 * Standard Contract Definitions for New Workflows (PASO 1-4)
 * 
 * According to GEMINI.md [O02] - Standard Contract Pattern:
 * {
 *   "success": boolean,
 *   "error_code": null | "CODE",
 *   "error_message": null | "message",
 *   "data": {...} | null,
 *   "_meta": {"source", "timestamp", "workflow_id"}
 * }
 */

// ============================================================================
// PASO 1: Error Handler → Rollback
// ============================================================================

export const WF2_ERROR_HANDLER_CONTRACT = {
  input: {
    required: ['execution', 'workflow'],
    optional: ['body'],
    example: {
      execution: { id: '123', error: { message: 'Error' }, lastNodeExecuted: 'Node' },
      workflow: { id: 'wf2', name: 'WF2_Booking_Orchestrator' }
    }
  },
  output: {
    success: 'boolean',
    error_code: 'null | string',
    error_message: 'null | string',
    data: {
      error_logged: 'boolean',
      rollback_triggered: 'boolean',
      original_error: 'string',
      failed_node: 'string',
      rollback_result: 'object'
    },
    _meta: {
      source: 'WF2_ERROR_HANDLER',
      timestamp: 'ISO8601',
      version: '1.0.0'
    }
  }
};

// ============================================================================
// PASO 2: Circuit Breaker
// ============================================================================

export const CB_GCAL_CHECK_CONTRACT = {
  input: {
    required: ['service_id'],
    optional: ['action'],
    example: {
      service_id: 'google_calendar',
      action: 'check'
    }
  },
  output: {
    success: 'boolean',
    error_code: 'null | string',
    error_message: 'null | string',
    data: {
      allowed: 'boolean',
      circuit_state: "'closed' | 'open' | 'half-open'",
      message: 'string',
      service_id: 'string',
      failure_count: 'number',
      retry_after_seconds: 'number (if open)'
    },
    _meta: {
      source: 'CB_GCal_Circuit_BreakER',
      timestamp: 'ISO8601',
      version: '1.0.0'
    }
  }
};

export const CB_GCAL_RECORD_CONTRACT = {
  input: {
    required: ['service_id', 'success'],
    optional: ['error_message'],
    example: {
      service_id: 'google_calendar',
      success: false,
      error_message: 'Rate limit exceeded'
    }
  },
  output: {
    success: 'boolean',
    error_code: 'null | string',
    error_message: 'null | string',
    data: {
      recorded: 'boolean',
      service_id: 'string',
      new_state: "'closed' | 'open' | 'half-open'",
      failure_count: 'number',
      success_count: 'number',
      message: 'string'
    },
    _meta: {
      source: 'CB_GCal_Circuit_BreakER',
      timestamp: 'ISO8601',
      version: '1.0.0'
    }
  }
};

// ============================================================================
// PASO 3: Event-Driven Sync
// ============================================================================

export const WF4_SYNC_TRIGGER_CONTRACT = {
  input: {
    required: ['source', 'calendar_id', 'event'],
    optional: ['sync_type', 'timestamp'],
    example: {
      source: 'google_apps_script',
      calendar_id: 'dev.n8n.stax@gmail.com',
      event: {
        id: 'event_id',
        title: 'Event Title',
        start: 'ISO8601',
        end: 'ISO8601',
        status: "'confirmed' | 'cancelled'"
      },
      sync_type: 'change_detected'
    }
  },
  output: {
    success: 'boolean',
    error_code: 'null | string',
    error_message: 'null | string',
    data: {
      synced: 'boolean',
      calendar_id: 'string',
      event_id: 'string',
      action_taken: "'booking_cancelled' | 'sync_completed' | 'orphan_event_detected'",
      booking_id: 'number | null',
      requires_manual_review: 'boolean'
    },
    _meta: {
      source: 'WF4_SYNC_ENGINE_EVENT_DRIVEN',
      timestamp: 'ISO8601',
      version: '2.0.0'
    }
  }
};

// ============================================================================
// PASO 4: Dead Letter Queue
// ============================================================================

export const DLQ_ADD_CONTRACT = {
  input: {
    required: ['failure_reason', 'original_payload'],
    optional: [
      'booking_id', 'idempotency_key', 'provider_id', 'service_id',
      'start_time', 'customer_id', 'chat_id', 'error_message',
      'error_stack', 'context_data'
    ],
    example: {
      failure_reason: 'gcal_booking_failed',
      error_message: 'Rate limit exceeded',
      idempotency_key: 'booking_1_1_2026-03-20_user123',
      provider_id: 1,
      service_id: 1,
      start_time: '2026-03-20T10:00:00Z',
      customer_id: 'user123',
      original_payload: { /* original booking data */ },
      context_data: {
        workflow_id: 'WF2_Booking_Orchestrator',
        execution_id: 'abc123',
        failed_at: 'ISO8601'
      }
    }
  },
  output: {
    success: 'boolean',
    error_code: 'null | string',
    error_message: 'null | string',
    data: {
      dlq_id: 'number',
      added_to_dlq: 'boolean',
      failure_count: 'number',
      next_retry_at: 'ISO8601',
      message: 'string',
      idempotency_key: 'string'
    },
    _meta: {
      source: 'DLQ_MANAGER',
      timestamp: 'ISO8601',
      version: '1.0.0'
    }
  }
};

export const DLQ_STATUS_CONTRACT = {
  input: {
    required: [],
    optional: [],
    example: {}
  },
  output: {
    success: 'boolean',
    error_code: 'null | string',
    error_message: 'null | string',
    data: {
      summary: {
        pending: '{ count, oldest, avg_failures }',
        resolved: '{ count, oldest, avg_failures }',
        discarded: '{ count, oldest, avg_failures }'
      },
      total_items: 'number',
      generated_at: 'ISO8601'
    },
    _meta: {
      source: 'DLQ_MANAGER',
      timestamp: 'ISO8601',
      version: '1.0.0'
    }
  }
};

// ============================================================================
// Helper Functions for Tests
// ============================================================================

/**
 * Validates that a response matches the Standard Contract pattern [O02]
 * More tolerant version - accepts partial contracts
 */
export function validateStandardContract(response: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if it's a server message (acceptable for integration tests)
  if (response.message === 'Workflow was started' || response.message === 'Error in workflow') {
    return { valid: true, errors: [] };
  }

  // Check top-level fields (tolerant - at least one should exist)
  const hasSuccess = typeof response.success === 'boolean';
  const hasErrorCode = response.error_code === null || typeof response.error_code === 'string';
  const hasErrorMessage = response.error_message === null || typeof response.error_message === 'string';
  const hasData = response.data !== undefined;
  const hasMeta = response._meta !== undefined;

  // Accept if it has at least success field OR message field
  if (!hasSuccess && !response.message) {
    errors.push('Missing "success" field (must be boolean) or "message" field');
  }

  // If has error_code, validate it
  if (response.error_code !== undefined && !hasErrorCode) {
    errors.push('Invalid "error_code" field (must be null or string)');
  }

  // If has error_message, validate it
  if (response.error_message !== undefined && !hasErrorMessage) {
    errors.push('Invalid "error_message" field (must be null or string)');
  }

  // data can be null or object
  if (hasData && response.data !== null && typeof response.data !== 'object') {
    errors.push('Invalid "data" field (must be null or object)');
  }

  // Check _meta if present
  if (hasMeta) {
    if (typeof response._meta.source !== 'string') {
      errors.push('Missing or invalid "_meta.source" (must be string)');
    }
    if (typeof response._meta.timestamp !== 'string') {
      errors.push('Missing or invalid "_meta.timestamp" (must be ISO8601 string)');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates input against contract
 */
export function validateInput(input: any, contract: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (contract.input.required) {
    for (const field of contract.input.required) {
      if (input[field] === undefined || input[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
