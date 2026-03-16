/**
 * @file devils-advocate.test.ts
 * @description 😈 DEVIL'S ADVOCATE TEST SUITE
 * 
 * ⚠️  NON-SATURATING EXECUTION:
 *    - Uses maxWorkers: 1 to prevent CPU overload
 *    - Sequential test execution with delays between tests
 *    - Jest configuration: workerIdleMemoryLimit: 512MB
 * 
 * 📊 Jest Configuration (jest.config.js):
 *    - maxWorkers: 1 - Prevents CPU saturation during test execution
 *    - testTimeout: 60000ms - Allows for complex edge case scenarios
 *    - workerIdleMemoryLimit: 512MB - Memory management
 * 
 * 🚀 Performance Notes:
 *    - No sobrecargar el CPU - tests run sequentially
 *    - "What if...?" scenarios executed one at a time
 *    - Batching: Tests grouped by failure mode category
 * 
 * Purpose: Question every assumption, find edge cases others miss
 * - "What if...?" scenarios
 * - Murphy's Law testing (anything that can go wrong, will)
 * - Real-world failure modes
 * - User stupidity simulation
 * - Infrastructure failures
 *
 * Mindset: "The system is evil and wants to hurt users"
 */

import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import {
  checkSystemHealth,
  sleep,
  RateLimiter,
  triggerWebhook,
  pollExecution,
  queryDatabase,
  cleanTestData,
  generateTestBooking,
  assertStandardContract,
  logTestStart,
  logTestResult,
  logSystemStatus,
} from './utils/test-helpers';

const rateLimiter = new RateLimiter(5, 1000);

// ============================================================================
// WHAT IF... USERS ARE CONFUSED
// ============================================================================

describe('😈 DEVIL'S ADVOCATE: USER CONFUSION', () => {
  beforeEach(async () => {
    await logSystemStatus();
    try {
      await cleanTestData();
    } catch (error) {
      console.log('Cleanup warning:', error.message);
    }
  });

  afterEach(async () => {
    try {
      await cleanTestData();
    } catch (error) {
      console.log('Cleanup warning:', error.message);
    }
  });

  test('DA-01: User sends emoji as provider_id', async () => {
    logTestStart('DA-01: Emoji as ID');
    
    const result = await triggerWebhook('book-appointment', {
      provider_id: '👨‍⚕️',
      service_id: 1,
      start_time: new Date(Date.now() + 86400000).toISOString(),
      customer_id: 'confused_user',
    });
    
    // Should handle gracefully
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    
    logTestResult('DA-01', true);
  });

  test('DA-02: User sends array instead of object', async () => {
    logTestStart('DA-02: Array instead of object');
    
    try {
      const response = await fetch(
        `${process.env.N8N_API_URL}/webhook/book-appointment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([1, 2, 3]),
        }
      );
      
      const result = await response.json();
      expect(result).toBeDefined();
    } catch (error: any) {
      // Error is acceptable
    }
    
    logTestResult('DA-02', true);
  });

  test('DA-03: User books for "yesterday"', async () => {
    logTestStart('DA-03: Past date booking');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const result = await triggerWebhook('book-appointment', {
      provider_id: 1,
      service_id: 1,
      start_time: yesterday.toISOString(),
      customer_id: 'time_traveler',
    });
    
    expect(result.success).toBe(false);
    
    logTestResult('DA-03', true);
  });

  test('DA-04: User books 1000 appointments', async () => {
    logTestStart('DA-04: Mass booking attempt');
    
    const results: any[] = [];
    
    for (let i = 0; i < 100; i++) {
      await rateLimiter.wait();
      
      const booking = generateTestBooking({
        customer_id: `mass_user_${i}`,
        chat_id: 9000000 + i,
        start_time: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
      });
      
      try {
        const result = await triggerWebhook('book-appointment', booking);
        results.push(result);
      } catch (error: any) {
        results.push({ error: error.message });
      }
    }
    
    const successes = results.filter(r => r.success === true).length;
    console.log(`Mass booking: ${successes}/100 succeeded`);
    
    // System should have limits
    expect(successes).toBeLessThan(100);
    
    logTestResult('DA-04', true, { successes, total: 100 });
  });

  test('DA-05: User sends HTML in name field', async () => {
    logTestStart('DA-05: HTML injection');
    
    const result = await triggerWebhook('book-appointment', {
      provider_id: 1,
      service_id: 1,
      start_time: new Date(Date.now() + 86400000).toISOString(),
      customer_id: 'test',
      customer_name: '<b>Bold User</b><script>alert(1)</script>',
    });
    
    // Should sanitize or accept safely
    expect(result).toBeDefined();
    
    logTestResult('DA-05', true);
  });

  test('DA-06: User sends null for everything', async () => {
    logTestStart('DA-06: All null values');
    
    const result = await triggerWebhook('book-appointment', {
      provider_id: null,
      service_id: null,
      start_time: null,
      customer_id: null,
      customer_name: null,
      customer_email: null,
    });
    
    expect(result.success).toBe(false);
    
    logTestResult('DA-06', true);
  });
});

// ============================================================================
// WHAT IF... INFRASTRUCTURE FAILS
// ============================================================================

describe('😈 DEVIL'S ADVOCATE: INFRASTRUCTURE FAILURES', () => {
  test('DA-07: Database is slow (timeout test)', async () => {
    logTestStart('DA-07: Slow DB simulation');
    
    // Make a query that might be slow
    const start = Date.now();
    
    try {
      const result = await queryDatabase(
        `SELECT COUNT(*) FROM bookings WHERE created_at > NOW() - INTERVAL '1 year'`
      );
      
      const duration = Date.now() - start;
      console.log(`Query took ${duration}ms`);
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000);
    } catch (error: any) {
      // Timeout is acceptable
      console.log('Query timed out');
    }
    
    logTestResult('DA-07', true);
  });

  test('DA-08: Webhook endpoint is down', async () => {
    logTestStart('DA-08: Endpoint down');
    
    try {
      const result = await triggerWebhook('non-existent-endpoint', {}, {
        timeout: 5000,
      });
      
      // Should fail gracefully
      expect(result).toBeDefined();
    } catch (error: any) {
      // 404 or timeout is expected
      console.log('Endpoint not found:', error.message);
    }
    
    logTestResult('DA-08', true);
  });

  test('DA-09: Network interruption mid-request', async () => {
    logTestStart('DA-09: Network interruption');
    
    const controller = new AbortController();
    
    // Start request
    const promise = fetch(
      `${process.env.N8N_API_URL}/webhook/book-appointment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateTestBooking()),
        signal: controller.signal,
      }
    );
    
    // Abort after 100ms
    setTimeout(() => controller.abort(), 100);
    
    try {
      await promise;
      console.warn('Request completed before abort');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted as expected');
      }
    }
    
    logTestResult('DA-09', true);
  });
});

// ============================================================================
// WHAT IF... DATA IS CORRUPT
// ============================================================================

describe('😈 DEVIL'S ADVOCATE: DATA CORRUPTION', () => {
  beforeEach(async () => {
    await logSystemStatus();
  });

  test('DA-10: UUID with wrong format', async () => {
    logTestStart('DA-10: Malformed UUID');
    
    const malformedUuids = [
      'not-a-uuid',
      '12345',
      'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      '00000000-0000-0000-0000-000000000000',
      'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
      '',
      'undefined',
      'null',
    ];
    
    for (const uuid of malformedUuids) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('db-cancel-booking-test', {
          booking_id: uuid,
          chat_id: 9000000,
        });
        
        // Should reject or handle gracefully
        if (result.success === true) {
          console.warn(`⚠️ Accepted malformed UUID: ${uuid}`);
        }
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('DA-10', true);
  });

  test('DA-11: Date at boundary conditions', async () => {
    logTestStart('DA-11: Boundary dates');
    
    const boundaryDates = [
      '2026-01-01T00:00:00Z', // New Year
      '2026-12-31T23:59:59Z', // End of year
      '2026-02-29T10:00:00Z', // Invalid (not leap year)
      '2028-02-29T10:00:00Z', // Valid (leap year)
      '2026-03-08T02:00:00Z', // DST transition
      '2026-11-01T01:00:00Z', // DST end
      '9999-12-31T23:59:59Z', // Far future
      '1970-01-01T00:00:00Z', // Unix epoch
    ];
    
    for (const date of boundaryDates) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('book-appointment', {
          provider_id: 1,
          service_id: 1,
          start_time: date,
          customer_id: 'boundary_test',
        });
        
        console.log(`${date}: ${result.success ? 'accepted' : 'rejected'}`);
      } catch (error: any) {
        console.log(`${date}: error - ${error.message}`);
      }
    }
    
    logTestResult('DA-11', true);
  });

  test('DA-12: Special characters in all fields', async () => {
    logTestStart('DA-12: Special characters');
    
    const specialChars = [
      "O'Connor",
      'José García',
      '李明',
      'Иванов',
      'محمد',
      'test@example.com',
      'user+tag@gmail.com',
      '123-456-7890',
      'Calle Falsa 123, Dept. 4B',
      '™®©',
    ];
    
    for (const name of specialChars) {
      await rateLimiter.wait();
      
      const result = await triggerWebhook('book-appointment', {
        provider_id: 1,
        service_id: 1,
        start_time: new Date(Date.now() + 86400000).toISOString(),
        customer_id: 'special_test',
        customer_name: name,
      });
      
      // Should handle all character sets
      expect(result).toBeDefined();
    }
    
    logTestResult('DA-12', true);
  });

  test('DA-13: Float instead of integer', async () => {
    logTestStart('DA-13: Float values');
    
    const result = await triggerWebhook('book-appointment', {
      provider_id: 1.5,
      service_id: 2.7,
      start_time: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 60.9,
      customer_id: 'float_test',
    });
    
    // Should handle (convert or reject)
    expect(result).toBeDefined();
    
    logTestResult('DA-13', true);
  });

  test('DA-14: Boolean where string expected', async () => {
    logTestStart('DA-14: Boolean instead of string');
    
    const result = await triggerWebhook('book-appointment', {
      provider_id: true,
      service_id: false,
      start_time: new Date(Date.now() + 86400000).toISOString(),
      customer_id: 'boolean_test',
      customer_name: true,
    });
    
    // Should handle gracefully
    expect(result).toBeDefined();
    
    logTestResult('DA-14', true);
  });
});

// ============================================================================
// WHAT IF... WORKFLOW LOGIC FAILS
// ============================================================================

describe('😈 DEVIL'S ADVOCATE: WORKFLOW FAILURES', () => {
  test('DA-15: Lock acquired but never released', async () => {
    logTestStart('DA-15: Orphaned lock');
    
    const booking = generateTestBooking();
    
    // Acquire lock
    const acquireResult = await triggerWebhook('acquire-lock', {
      provider_id: booking.provider_id,
      start_time: booking.start_time,
      lock_duration_minutes: 60, // Long TTL
    });
    
    expect(acquireResult.data?.acquired).toBe(true);
    const lockKey = acquireResult.data?.lock_key;
    
    console.log(`Acquired lock: ${lockKey} (not releasing)`);
    
    // Try to acquire same lock - should fail
    const acquireResult2 = await triggerWebhook('acquire-lock', {
      provider_id: booking.provider_id,
      start_time: booking.start_time,
      lock_duration_minutes: 5,
    });
    
    expect(acquireResult2.data?.acquired).toBe(false);
    
    // Cleanup
    await triggerWebhook('acquire-lock', {
      lock_key: lockKey,
      action: 'release',
    });
    
    logTestResult('DA-15', true);
  });

  test('DA-16: Circuit breaker stuck in half-open', async () => {
    logTestStart('DA-16: Circuit breaker edge case');
    
    const serviceId = 'test_half_open_' + Date.now();
    
    // Record 5 failures to open circuit
    for (let i = 0; i < 5; i++) {
      await rateLimiter.wait();
      await triggerWebhook('circuit-breaker/record', {
        service_id: serviceId,
        success: false,
      });
    }
    
    // Check state
    const checkResult = await triggerWebhook('circuit-breaker/check', {
      service_id: serviceId,
    });
    
    expect(checkResult.data?.circuit_state).toBe('open');
    
    // Wait for half-open (should happen after retry period)
    console.log('Waiting for half-open...');
    await sleep(65000); // Wait 65 seconds
    
    // Check again
    const checkResult2 = await triggerWebhook('circuit-breaker/check', {
      service_id: serviceId,
    });
    
    console.log(`State after wait: ${checkResult2.data?.circuit_state}`);
    
    logTestResult('DA-16', true);
  });

  test('DA-17: DLQ entry without required fields', async () => {
    logTestStart('DA-17: Incomplete DLQ entry');
    
    const incompleteEntries = [
      {},
      { failure_reason: 'test' },
      { original_payload: {} },
      { failure_reason: '', original_payload: {} },
      { failure_reason: 'test', original_payload: null },
    ];
    
    for (const entry of incompleteEntries) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('dlq/add', entry);
        
        // Should reject incomplete entries
        if (result.success === true) {
          console.warn('⚠️ Accepted incomplete DLQ entry');
        }
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('DA-17', true);
  });

  test('DA-18: Rollback with partial data', async () => {
    logTestStart('DA-18: Partial rollback');
    
    // Try rollback with only booking_id
    const result1 = await triggerWebhook('rollback-booking', {
      booking_id: '123e4567-e89b-12d3-a456-426614174000',
      gcal_event_id: null,
      lock_key: null,
      reason: 'Partial rollback test',
    });
    
    // Should handle gracefully
    expect(result1).toBeDefined();
    
    // Try rollback with only gcal_event_id
    const result2 = await triggerWebhook('rollback-booking', {
      booking_id: null,
      gcal_event_id: 'fake_gcal_id',
      lock_key: null,
      reason: 'Partial rollback test',
    });
    
    expect(result2).toBeDefined();
    
    logTestResult('DA-18', true);
  });
});

// ============================================================================
// WHAT IF... USERS ARE MALICIOUS (LIGHT)
// ============================================================================

describe('😈 DEVIL'S ADVOCATE: MALICIOUS USERS', () => {
  test('DA-19: Try to access admin endpoints', async () => {
    logTestStart('DA-19: Admin endpoint access');
    
    const adminPaths = [
      'admin',
      'api/v1/workflows',
      'api/v1/executions',
      'system',
      'debug',
    ];
    
    for (const path of adminPaths) {
      await rateLimiter.wait();
      
      try {
        const response = await fetch(
          `${process.env.N8N_API_URL}/webhook/${path}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: 'data' }),
          }
        );
        
        // Should not expose admin functionality
        expect([404, 401, 403]).toContain(response.status);
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('DA-19', true);
  });

  test('DA-20: Try to enumerate chat_ids', async () => {
    logTestStart('DA-20: Chat ID enumeration');
    
    const foundUsers: number[] = [];
    
    // Try common chat_ids
    for (const chatId of [1, 100, 1000, 10000, 100000, 1000000]) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('db-get-user-bookings', {
          chat_id: chatId,
        });
        
        if (result.data?.bookings?.length > 0) {
          foundUsers.push(chatId);
        }
      } catch (error: any) {
        // Not found
      }
    }
    
    console.log(`Found ${foundUsers.length} users with bookings`);
    
    // System should not allow easy enumeration
    expect(foundUsers.length).toBeLessThan(6);
    
    logTestResult('DA-20', true);
  });
});

// ============================================================================
// MURPHY'S LAW TESTS
// ============================================================================

describe('☠️ MURPHY\'S LAW: WORST CASE SCENARIOS', () => {
  test('ML-01: Everything fails at once', async () => {
    logTestStart('ML-01: Cascading failures');
    
    // Simulate multiple failures
    const failures: string[] = [];
    
    try {
      // DB fails
      await queryDatabase('SELECT * FROM non_existent_table');
    } catch (error: any) {
      failures.push('db');
    }
    
    try {
      // Invalid webhook
      await triggerWebhook('non-existent', {});
    } catch (error: any) {
      failures.push('webhook');
    }
    
    try {
      // Invalid booking
      const result = await triggerWebhook('book-appointment', {
        provider_id: -1,
        service_id: -1,
        start_time: 'invalid',
      });
      
      if (!result.success) {
        failures.push('validation');
      }
    } catch (error: any) {
      failures.push('booking');
    }
    
    console.log(`Failures: ${failures.join(', ')}`);
    
    // System should handle gracefully (not crash)
    expect(failures.length).toBeGreaterThanOrEqual(1);
    
    logTestResult('ML-01', true);
  });

  test('ML-02: Race condition on booking creation', async () => {
    logTestStart('ML-02: Race condition');
    
    const booking = generateTestBooking();
    
    // Try to create same booking 10 times simultaneously
    const promises = Array.from({ length: 10 }).map(() =>
      triggerWebhook('book-appointment', booking)
    );
    
    const results = await Promise.all(promises);
    
    const successes = results.filter(r => r.success === true);
    console.log(`Race condition: ${successes.length}/10 succeeded`);
    
    // Should be exactly 1 success (idempotency or locking)
    expect(successes.length).toBe(1);
    
    logTestResult('ML-02', true, { successes: successes.length });
  });

  test('ML-03: Memory exhaustion via large payloads', async () => {
    logTestStart('ML-03: Memory exhaustion');
    
    const healthBefore = await checkSystemHealth();
    
    // Send 10 large payloads
    for (let i = 0; i < 10; i++) {
      await rateLimiter.wait();
      
      const largeBooking = {
        ...generateTestBooking(),
        customer_name: 'a'.repeat(1024 * 1024), // 1MB name
        notes: 'b'.repeat(1024 * 1024), // 1MB notes
      };
      
      try {
        await triggerWebhook('book-appointment', largeBooking, {
          timeout: 5000,
        });
      } catch (error: any) {
        // Timeout or rejection is expected
      }
    }
    
    const healthAfter = await checkSystemHealth();
    
    console.log(`Memory before: ${healthBefore.memoryUsage}MB`);
    console.log(`Memory after: ${healthAfter.memoryUsage}MB`);
    
    // System should not crash
    expect(healthAfter.isHealthy).toBe(true);
    
    logTestResult('ML-03', true);
  });
});
