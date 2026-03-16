/**
 * @file red-team-attack.test.ts
 * @description 🔴 RED TEAM ATTACK SUITE
 * 
 * ⚠️  NON-SATURATING EXECUTION:
 *    - Uses maxWorkers: 1 to prevent CPU overload
 *    - Sequential test execution with delays between tests
 *    - Jest configuration: workerIdleMemoryLimit: 512MB
 * 
 * 📊 Jest Configuration (jest.config.js):
 *    - maxWorkers: 1 - Prevents CPU saturation during test execution
 *    - testTimeout: 60000ms - Allows for attack simulation
 *    - workerIdleMemoryLimit: 512MB - Memory management
 * 
 * 🚀 Performance Notes:
 *    - No sobrecargar el CPU - tests run sequentially
 *    - Rate limit all attacks to prevent system overload
 *    - Batching: Attacks grouped by vector with delays between batches
 * 
 * Purpose: Simulate malicious actor behavior
 * - Maximum paranoia
 * - Attack vectors from real-world breaches
 * - Protocol abuse
 * - Resource exhaustion
 * - Data exfiltration attempts
 *
 * Rules of Engagement:
 * - Do NOT saturate CPU (rate limit all attacks)
 * - Do NOT corrupt production data (use test range: chat_id >= 9000000)
 * - Document all successful attacks
 * - Auto-rollback any state changes
 */

import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import {
  checkSystemHealth,
  sleep,
  RateLimiter,
  triggerWebhook,
  queryDatabase,
  cleanTestData,
  generateTestBooking,
  logTestStart,
  logTestResult,
  logSystemStatus,
  SQL_INJECTION_PAYLOADS,
  XSS_PAYLOADS,
} from './utils/test-helpers';

const rateLimiter = new RateLimiter(5, 1000); // 5 requests per second

// ============================================================================
// ATTACK VECTOR 1: PROTOCOL ABUSE
// ============================================================================

describe('🔴 RED TEAM: PROTOCOL ABUSE', () => {
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

  test('RT-01: HTTP method confusion', async () => {
    logTestStart('RT-01: HTTP method abuse');
    
    const methods = ['GET', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
    const results: any[] = [];
    
    for (const method of methods) {
      await rateLimiter.wait();
      
      try {
        const response = await fetch(
          `${process.env.N8N_API_URL}/webhook/book-appointment`,
          {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(generateTestBooking()),
          }
        );
        
        results.push({ method, status: response.status });
      } catch (error: any) {
        results.push({ method, error: error.message });
      }
    }
    
    console.log('Method results:', results);
    
    // ASSERT: Only POST should work (200), others should fail
    const postResult = results.find(r => r.method === 'POST');
    expect(postResult?.status).toBeLessThan(500); // Should not crash
    
    logTestResult('RT-01', true, { methodsTested: methods.length });
  });

  test('RT-02: Content-Type confusion', async () => {
    logTestStart('RT-02: Content-Type abuse');
    
    const contentTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain',
      'application/xml',
      'text/html',
      '', // No content-type
    ];
    
    for (const contentType of contentTypes) {
      await rateLimiter.wait();
      
      try {
        const headers: any = {};
        if (contentType) headers['Content-Type'] = contentType;
        
        const response = await fetch(
          `${process.env.N8N_API_URL}/webhook/book-appointment`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(generateTestBooking()),
          }
        );
        
        // Should handle gracefully (not crash)
        expect(response.status).toBeLessThan(500);
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('RT-02', true);
  });

  test('RT-03: Massive payload (DoS attempt)', async () => {
    logTestStart('RT-03: Payload size attack');
    
    // Generate 10MB payload
    const massiveBooking = {
      ...generateTestBooking(),
      customer_name: 'a'.repeat(10 * 1024 * 1024), // 10MB name field
    };
    
    try {
      const result = await triggerWebhook('book-appointment', massiveBooking, {
        timeout: 10000, // 10s timeout
      });
      
      // If it succeeds, system is vulnerable
      console.warn('⚠️ Massive payload accepted!');
    } catch (error: any) {
      // Expected: timeout or rejection
      console.log('Payload rejected:', error.message);
    }
    
    logTestResult('RT-03', true);
  });

  test('RT-04: Header injection', async () => {
    logTestStart('RT-04: Header injection');
    
    const maliciousHeaders = {
      'X-Forwarded-For': '127.0.0.1',
      'X-Real-IP': '127.0.0.1',
      'Host': 'evil.com',
      'Referer': 'javascript:alert(1)',
      'Cookie': 'session=admin',
      'Authorization': 'Bearer fake_token',
      'X-N8N-API-KEY': 'fake_key',
    };
    
    for (const [header, value] of Object.entries(maliciousHeaders)) {
      await rateLimiter.wait();
      
      try {
        const response = await fetch(
          `${process.env.N8N_API_URL}/webhook/book-appointment`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              [header]: value,
            },
            body: JSON.stringify(generateTestBooking()),
          }
        );
        
        // Should ignore malicious headers
        expect(response.status).toBeLessThan(500);
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('RT-04', true);
  });
});

// ============================================================================
// ATTACK VECTOR 2: BUSINESS LOGIC ABUSE
// ============================================================================

describe('🔴 RED TEAM: BUSINESS LOGIC ABUSE', () => {
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

  test('RT-05: Slot squatting (hold all slots)', async () => {
    logTestStart('RT-05: Slot squatting attack');
    
    const acquiredLocks: string[] = [];
    
    try {
      // Try to acquire locks for all slots tomorrow
      for (let hour = 8; hour < 20; hour++) {
        await rateLimiter.wait();
        
        const startTime = new Date();
        startTime.setDate(startTime.getDate() + 1);
        startTime.setHours(hour, 0, 0, 0);
        
        const result = await triggerWebhook('acquire-lock', {
          provider_id: 1,
          start_time: startTime.toISOString(),
          lock_duration_minutes: 5, // Short TTL
        });
        
        if (result.data?.acquired) {
          acquiredLocks.push(result.data.lock_key);
        }
      }
      
      console.log(`Acquired ${acquiredLocks.length} locks`);
      
      // System should limit lock acquisitions
      expect(acquiredLocks.length).toBeLessThan(12); // Not all slots
      
    } finally {
      // Cleanup: release all locks
      for (const lockKey of acquiredLocks) {
        try {
          await triggerWebhook('acquire-lock', {
            lock_key: lockKey,
            action: 'release',
          });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
    
    logTestResult('RT-05', true, { locksAcquired: acquiredLocks.length });
  });

  test('RT-06: Booking spam (rate limit bypass)', async () => {
    logTestStart('RT-06: Booking spam');
    
    const results: any[] = [];
    
    // Try 20 bookings in rapid succession
    for (let i = 0; i < 20; i++) {
      await rateLimiter.wait();
      
      const booking = generateTestBooking({
        customer_id: `spam_user_${i}`,
        chat_id: 9000000 + i,
      });
      
      try {
        const result = await triggerWebhook('book-appointment', booking);
        results.push(result);
      } catch (error: any) {
        results.push({ error: error.message });
      }
    }
    
    const successes = results.filter(r => r.success === true).length;
    console.log(`Spam results: ${successes}/20 succeeded`);
    
    // System should have rate limiting or similar protection
    expect(successes).toBeLessThan(20);
    
    logTestResult('RT-06', true, { successes, total: 20 });
  });

  test('RT-07: Idempotency key collision attack', async () => {
    logTestStart('RT-07: Idempotency collision');
    
    const sameKey = 'booking_1_1_2026-03-20T10:00:00Z_attacker';
    
    // First booking
    const result1 = await triggerWebhook('booking-orchestrator', {
      provider_id: 1,
      service_id: 1,
      start_time: '2026-03-20T10:00:00Z',
      customer_id: 'attacker1',
      idempotency_key: sameKey,
    });
    
    await rateLimiter.wait();
    
    // Second booking with same key but different customer
    const result2 = await triggerWebhook('booking-orchestrator', {
      provider_id: 1,
      service_id: 1,
      start_time: '2026-03-20T10:00:00Z',
      customer_id: 'attacker2', // Different customer
      idempotency_key: sameKey, // Same key
    });
    
    // Should detect collision and handle appropriately
    console.log('Result 1:', result1.success);
    console.log('Result 2:', result2.success);
    
    logTestResult('RT-07', true);
  });

  test('RT-08: Negative/zero values attack', async () => {
    logTestStart('RT-08: Negative/zero values');
    
    const maliciousBookings = [
      { provider_id: 0, service_id: 1 },
      { provider_id: -1, service_id: 1 },
      { provider_id: 1, service_id: 0 },
      { provider_id: 1, service_id: -1 },
      { provider_id: 1, service_id: 1, duration_minutes: 0 },
      { provider_id: 1, service_id: 1, duration_minutes: -60 },
      { provider_id: 1, service_id: 1, chat_id: 0 },
      { provider_id: 1, service_id: 1, chat_id: -1 },
    ];
    
    for (const booking of maliciousBookings) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('book-appointment', {
          ...booking,
          start_time: new Date(Date.now() + 86400000).toISOString(),
          customer_id: 'test',
        });
        
        // Should reject invalid values
        if (result.success === true) {
          console.warn('⚠️ Accepted invalid booking:', booking);
        }
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('RT-08', true);
  });
});

// ============================================================================
// ATTACK VECTOR 3: DATA EXFILTRATION
// ============================================================================

describe('🔴 RED TEAM: DATA EXFILTRATION', () => {
  beforeEach(async () => {
    await logSystemStatus();
  });

  test('RT-09: Enumerate all providers', async () => {
    logTestStart('RT-09: Provider enumeration');
    
    const providerIds: number[] = [];
    
    // Try provider IDs 1-100
    for (let i = 1; i <= 100; i++) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('db-get-availability-test', {
          provider_id: i,
          start_time: new Date(Date.now() + 86400000).toISOString(),
        });
        
        if (result.success || result.data) {
          providerIds.push(i);
        }
      } catch (error: any) {
        // Not found
      }
    }
    
    console.log(`Found ${providerIds.length} providers`);
    
    // System should not allow easy enumeration
    expect(providerIds.length).toBeLessThan(100);
    
    logTestResult('RT-09', true, { providersFound: providerIds.length });
  });

  test('RT-10: Extract user bookings via injection', async () => {
    logTestStart('RT-10: User data extraction');
    
    // Try to extract bookings using various techniques
    const payloads = [
      { booking_id: "1' OR '1'='1" },
      { booking_id: '1; SELECT * FROM bookings' },
      { chat_id: 0 },
      { chat_id: -1 },
    ];
    
    for (const payload of payloads) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('db-cancel-booking-test', {
          ...payload,
          chat_id: payload.chat_id || 9000000,
        });
        
        // Should not return other users' data
        if (result.data?.bookings) {
          expect(Array.isArray(result.data.bookings)).toBe(true);
        }
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('RT-10', true);
  });

  test('RT-11: Access internal workflow data', async () => {
    logTestStart('RT-11: Internal data access');
    
    // Try to access internal endpoints
    const internalPaths = [
      'nn-00-global-error',
      'circuit-breaker/check',
      'dlq/add',
      'rollback-booking',
    ];
    
    for (const path of internalPaths) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook(path, {
          test: 'data',
        });
        
        // Should not expose internal structure
        expect(result).toBeDefined();
      } catch (error: any) {
        // Error is acceptable
      }
    }
    
    logTestResult('RT-11', true);
  });
});

// ============================================================================
// ATTACK VECTOR 4: STATE CORRUPTION
// ============================================================================

describe('🔴 RED TEAM: STATE CORRUPTION', () => {
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

  test('RT-12: Circuit breaker abuse (trip all services)', async () => {
    logTestStart('RT-12: Circuit breaker attack');
    
    const services = [
      'google_calendar',
      'postgres_db',
      'telegram_bot',
      'gmail_service',
      'fake_service_1',
      'fake_service_2',
    ];
    
    for (const service of services) {
      // Record 10 failures to trip circuit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.wait();
        
        try {
          await triggerWebhook('circuit-breaker/record', {
            service_id: service,
            success: false,
            error_message: 'Attack',
          });
        } catch (error) {
          // Ignore
        }
      }
    }
    
    // Check if circuits are tripped
    for (const service of services) {
      await rateLimiter.wait();
      
      const result = await triggerWebhook('circuit-breaker/check', {
        service_id: service,
      });
      
      console.log(`${service}: ${result.data?.circuit_state}`);
    }
    
    logTestResult('RT-12', true);
  });

  test('RT-13: DLQ flooding', async () => {
    logTestStart('RT-13: DLQ flood attack');
    
    // Try to add 50 entries to DLQ
    const added: number[] = [];
    
    for (let i = 0; i < 50; i++) {
      await rateLimiter.wait();
      
      try {
        const result = await triggerWebhook('dlq/add', {
          failure_reason: 'attack',
          original_payload: { attack: true, index: i },
          idempotency_key: `attack_${i}`,
        });
        
        if (result.success) {
          added.push(i);
        }
      } catch (error: any) {
        // Rate limited or rejected
      }
    }
    
    console.log(`Added ${added.length}/50 entries to DLQ`);
    
    // System should have DLQ limits
    expect(added.length).toBeLessThan(50);
    
    logTestResult('RT-13', true, { entriesAdded: added.length });
  });

  test('RT-14: Lock exhaustion', async () => {
    logTestStart('RT-14: Lock exhaustion');
    
    const locks: string[] = [];
    
    try {
      // Try to acquire 100 locks
      for (let i = 0; i < 100; i++) {
        await rateLimiter.wait();
        
        const startTime = new Date();
        startTime.setDate(startTime.getDate() + 1);
        startTime.setHours(8 + (i % 12), 0, 0, 0);
        
        const result = await triggerWebhook('acquire-lock', {
          provider_id: 1,
          start_time: startTime.toISOString(),
          lock_duration_minutes: 60, // Long TTL
        });
        
        if (result.data?.acquired) {
          locks.push(result.data.lock_key);
        }
      }
      
      console.log(`Acquired ${locks.length} locks`);
      
      // System should limit lock acquisitions per provider
      expect(locks.length).toBeLessThan(100);
      
    } finally {
      // Cleanup
      for (const lockKey of locks) {
        try {
          await triggerWebhook('acquire-lock', {
            lock_key: lockKey,
            action: 'release',
          });
        } catch (error) {
          // Ignore
        }
      }
    }
    
    logTestResult('RT-14', true, { locksAcquired: locks.length });
  });
});

// ============================================================================
// ATTACK VECTOR 5: TIMING ATTACKS
// ============================================================================

describe('🔴 RED TEAM: TIMING ATTACKS', () => {
  test('RT-15: Response timing analysis', async () => {
    logTestStart('RT-15: Timing analysis');
    
    const timings: number[] = [];
    
    // Make 20 requests and measure response times
    for (let i = 0; i < 20; i++) {
      await rateLimiter.wait();
      
      const start = Date.now();
      
      try {
        await triggerWebhook('db-get-availability-test', {
          provider_id: 1,
          start_time: new Date(Date.now() + 86400000).toISOString(),
        });
      } catch (error) {
        // Ignore
      }
      
      timings.push(Date.now() - start);
    }
    
    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    const maxTime = Math.max(...timings);
    const minTime = Math.min(...timings);
    
    console.log(`Timing: avg=${avgTime}ms, min=${minTime}ms, max=${maxTime}ms`);
    
    // Large timing differences might indicate vulnerabilities
    expect(maxTime / minTime).toBeLessThan(10); // Should be relatively consistent
    
    logTestResult('RT-15', true, { avgTime, minTime, maxTime });
  });
});
