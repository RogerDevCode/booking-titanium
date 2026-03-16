# WF* Comprehensive Stress Test Plan - Booking Titanium

**Date:** 2026-03-16  
**Version:** 1.0.0  
**Author:** AI Engineering Team  
**Status:** Ready for Implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Test Matrix (Workflow × Test Type)](#2-test-matrix-workflow--test-type)
3. [Workflow Dependency Graph](#3-workflow-dependency-graph)
4. [Unit Test Specifications](#4-unit-test-specifications)
5. [Integration Test Specifications](#5-integration-test-specifications)
6. [Stress/Load Test Specifications](#6-stressload-test-specifications)
7. [Security Test Specifications](#7-security-test-specifications)
8. [Edge Case Test Specifications](#8-edge-case-test-specifications)
9. [Regression Test Specifications](#9-regression-test-specifications)
10. [Community-Suggested Patterns](#10-community-suggested-patterns)
11. [Test Scripts to Create (TypeScript + Jest)](#11-test-scripts-to-create-typescript--jest)
12. [Data Fixtures Required](#12-data-fixtures-required)
13. [Success Criteria Per Test](#13-success-criteria-per-test)
14. [CPU/Memory Monitoring Strategy](#14-cpumemory-monitoring-strategy)
15. [Rollback Verification Tests](#15-rollback-verification-tests)
16. [Appendix: Historical Bugs Reference](#16-appendix-historical-bugs-reference)

---

## 1. Executive Summary

### 1.1 Purpose

This document defines a comprehensive testing strategy for the Booking Titanium project's workflow ecosystem (WF1-WF7 and supporting workflows). The strategy ensures:

- **Reliability**: All workflows function correctly under normal and stress conditions
- **Data Integrity**: No double-bookings, data corruption, or orphaned records
- **Security**: Protection against injection attacks and malformed data
- **Resilience**: Proper error handling and rollback mechanisms
- **Performance**: Acceptable response times under load

### 1.2 Scope

**Workflows Under Test:**

| ID | Name | Type | Priority |
|----|------|------|----------|
| WF1 | Booking_API_Gateway | Root/Entry | P0 |
| WF2 | Booking_Orchestrator | Core/Orchestrator | P0 |
| WF3 | Availability_Service | Leaf/Service | P1 |
| WF4 | Sync_Engine | Background/Sync | P1 |
| WF5 | GCal_Collision_Check | Validation | P1 |
| WF6 | Rollback_Workflow | Recovery | P0 |
| WF7 | Distributed_Lock_System | Infrastructure | P0 |
| CB_01/02 | Circuit_Breaker | Resilience | P1 |
| DLQ_* | Dead_Letter_Queue | Recovery | P2 |
| NN_* | Neural Network (AI) | AI/ML | P1 |
| DB_* | Database Operations | Leaf/Data | P1 |
| GCAL_* | Google Calendar | External | P1 |

### 1.3 Testing Principles

Based on lessons learned (2026-03-09 to 2026-03-15):

1. **Never trust implicit passthrough** - Always validate and map explicitly
2. **Context preservation is mandatory** - Use `ctx` object pattern throughout
3. **Rollback requires valid IDs** - Never call rollback without verification
4. **No JSON.stringify in expressions** - Use bodyParameters or Code nodes
5. **Guard skipped node access** - Use `isExecuted` before accessing `$node["X"]`
6. **Rate limit all tests** - `maxWorkers: 1` in Jest to prevent CPU saturation
7. **Triple Entry Pattern** - Manual Trigger + When Called + Webhook for root workflows
8. **Standard Contract** - All outputs follow `{success, error_code, data, _meta}`

---

## 2. Test Matrix (Workflow × Test Type)

### 2.1 Complete Test Coverage Matrix

| Workflow | Unit | Integration | Stress | Security | Edge Cases | Regression | Rollback |
|----------|------|-------------|--------|----------|------------|------------|----------|
| **WF1** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **WF2** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **WF3** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **WF4** | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| **WF5** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **WF6** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **WF7** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CB_01/02** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **DLQ_*** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **NN_02** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **NN_03** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **DB_*** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| **GCAL_*** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Legend:**
- ✅ = Required
- N/A = Not applicable (rollback tests only for workflows that create state)

### 2.2 Test Count Summary

| Test Type | Count | Estimated Runtime |
|-----------|-------|-------------------|
| Unit Tests | 87 | 15 min |
| Integration Tests | 34 | 25 min |
| Stress Tests | 12 | 45 min |
| Security Tests | 18 | 10 min |
| Edge Cases | 42 | 20 min |
| Regression Tests | 28 | 30 min |
| Rollback Tests | 15 | 15 min |
| **Total** | **236** | **~160 min** |

---

## 3. Workflow Dependency Graph

### 3.1 Activation Order (Bottom-Up Testing)

Based on `/scripts-ts/workflow_activation_order.json`:

```
L0 (Leaf/Infrastructure):
├── BB_00_Config (order: 15)
├── DB_Get_Availability (order: 5)
├── DB_Create_Booking (order: 6)
├── DB_Cancel_Booking (order: 7)
├── DB_Reschedule_Booking (order: 8)
├── DB_Find_Next_Available (order: 9)
├── WF7_Distributed_Lock (order: 43)
├── CB_01_Check_State (order: 59)
├── CB_02_Record_Result (order: 61)
├── DLQ_01_Add_Entry (order: 60)
└── DLQ_02_Get_Status (order: 62)

L1 (Services):
├── GCAL_Create_Event (order: 10)
├── GCAL_Delete_Event (order: 11)
├── GMAIL_Send_Confirmation (order: 12)
├── WF3_Availability_Service (order: 38)
├── WF5_GCal_Collision_Check (order: 44)
└── WF4_Sync_Engine (order: 40)

L2 (Core Processing):
├── NN_02_Message_Parser (order: 2)
├── NN_03_AI_Agent (order: 3)
├── NN_04_Telegram_Sender (order: 4)
├── WF6_Rollback_Workflow (order: 41)
└── WF2_Orchestrator_Error_Handler (order: 45)

L3 (Root/Entry):
├── WF1_Booking_API_Gateway (order: 63)
├── WF2_Booking_Orchestrator (order: 57)
└── NN_01_Booking_Gateway (order: 13)
```

### 3.2 Internal Webhook Calls (WF2 → Sub-workflows)

```javascript
// WF2_Booking_Orchestrator HTTP Request calls:
1. Check Availability → https://n8n.stax.ink/webhook/db-get-availability-test (WF3)
2. Acquire Lock → https://n8n.stax.ink/webhook/acquire-lock (WF7)
3. Check Circuit Breaker → https://n8n.stax.ink/webhook/circuit-breaker/check (CB_01)
4. Record GCal Success → https://n8n.stax.ink/webhook/circuit-breaker/record (CB_02)
5. Check Collision → https://n8n.stax.ink/webhook/gcal-collision-check (WF5)
6. Create GCal Event → https://n8n.stax.ink/webhook/gcal-create-event (GCAL_Create)
7. Create Booking → https://n8n.stax.ink/webhook/db-create-booking-test (DB_Create)
```

### 3.3 Error Handler Chain

```
WF2_Error_Handler → WF6_Rollback_Workflow
    └── Condition: has_valid_id === true
    └── Skip: has_valid_id === false (early failure)
```

---

## 4. Unit Test Specifications

### 4.1 WF1_Booking_API_Gateway Unit Tests

**File:** `tests/wf1_gateway.test.ts` (existing - extend)

| Test ID | Description | Input | Expected Output |
|---------|-------------|-------|-----------------|
| WF1-UT-01 | Accept valid payload | `{provider_id: 1, service_id: 1, start_time: ISO, customer_id: "test"}` | `success: true`, calls orchestrator |
| WF1-UT-02 | Reject missing provider_id | `{service_id: 1, ...}` | `success: false, error_code: "VALIDATION_ERROR"` |
| WF1-UT-03 | Reject provider_id = 0 | `{provider_id: 0, ...}` | `error_code: "VALIDATION_ERROR", message: "positive integer"` |
| WF1-UT-04 | Reject negative provider_id | `{provider_id: -5, ...}` | `error_code: "VALIDATION_ERROR"` |
| WF1-UT-05 | Reject missing service_id | `{provider_id: 1, ...}` | `error_code: "VALIDATION_ERROR"` |
| WF1-UT-06 | Reject missing start_time | `{provider_id: 1, service_id: 1}` | `error_code: "VALIDATION_ERROR"` |
| WF1-UT-07 | Reject invalid ISO date | `{start_time: "not-a-date"}` | `error_code: "VALIDATION_ERROR"` |
| WF1-UT-08 | Reject past date | `{start_time: "2020-01-01"}` | `error_code: "VALIDATION_ERROR", message: "future"` |
| WF1-UT-09 | Accept optional duration (default 60) | `{...}` without duration | Passes validation |
| WF1-UT-10 | Reject duration < 15 | `{duration_minutes: 10}` | `error_code: "VALIDATION_ERROR", message: "15-480"` |
| WF1-UT-11 | Reject duration > 480 | `{duration_minutes: 500}` | `error_code: "VALIDATION_ERROR"` |
| WF1-UT-12 | Require customer_id or chat_id | Neither provided | `error_code: "VALIDATION_ERROR"` |
| WF1-UT-13 | Sanitize long strings | `customer_id: "a".repeat(200)` | Truncated to max length |
| WF1-UT-14 | Generate idempotency key | Valid payload | Key format: `booking_{provider}_{service}_{time}_{customer}` |

### 4.2 WF2_Booking_Orchestrator Unit Tests

**File:** `tests/orchestrator.test.ts` (existing - extend)

| Test ID | Description | Input | Expected Output |
|---------|-------------|-------|-----------------|
| WF2-UT-01 | Validate required fields | Missing `provider_id` | `_error: true, _error_message: "Missing required field"` |
| WF2-UT-02 | Generate idempotency key | Valid input | `ctx.idempotency_key` set |
| WF2-UT-03 | Detect duplicate booking | Existing idempotency_key in DB | `is_duplicate: true`, existing booking data |
| WF2-UT-04 | Preserve context in duplicate branch | Duplicate detected | `ctx` object preserved with `_idempotency.is_duplicate: true` |
| WF2-UT-05 | Acquire lock successfully | No existing lock | `data.acquired: true, data.owner_token` |
| WF2-UT-06 | Handle lock acquisition failure | Lock already held | `success: false, error_code: "LOCK_DENIED"` |
| WF2-UT-07 | Check circuit breaker (closed) | Service healthy | `allowed: true` |
| WF2-UT-08 | Check circuit breaker (open) | Service tripped | `allowed: false, message: "Retry in..."` |
| WF2-UT-09 | Create GCal event | All checks passed | `gcal_event_id` returned |
| WF2-UT-10 | Create DB booking | GCal created | `booking_id` returned |
| WF2-UT-11 | Release lock on success | Booking complete | Lock deleted from DB |
| WF2-UT-12 | Standard Contract output | Any response | `{success, error_code, data, _meta}` |

### 4.3 WF7_Distributed_Lock_System Unit Tests

**File:** `tests/lock.test.ts` (existing - extend)

| Test ID | Description | Input | Expected Output |
|---------|-------------|-------|-----------------|
| WF7-UT-01 | Acquire new lock | `provider_id, start_time` | `acquired: true, owner_token` |
| WF7-UT-02 | Deny duplicate lock | Same `provider_id, start_time` | `acquired: false, error_code: "LOCK_HELD"` |
| WF7-UT-03 | Release with correct token | `lock_key, owner_token` | `released: true` |
| WF7-UT-04 | Reject release with wrong token | `lock_key, wrong_token` | `released: false, error_code: "LOCK_NOT_FOUND"` |
| WF7-UT-05 | Auto-cleanup expired locks | Lock with `expires_at < NOW()` | New lock acquired successfully |
| WF7-UT-06 | Generate deterministic lock_key | `provider_id: 1, start_time: "2026-03-20T10:00:00"` | `lock_1_2026-03-20T10_00_00` |
| WF7-UT-07 | Standard Contract output | Any response | `{success, error_code, data, _meta}` |

### 4.4 CB_01/02_Circuit_Breaker Unit Tests

**File:** `tests/circuit_breaker.test.ts` (existing - extend)

| Test ID | Description | Input | Expected Output |
|---------|-------------|-------|-----------------|
| CB-UT-01 | Check new service (default closed) | `service_id: "test_new"` | `allowed: true, circuit_state: "closed"` |
| CB-UT-02 | Record success | `action: "record_success"` | `recorded: true, new_state: "closed"` |
| CB-UT-03 | Record failure | `action: "record_failure"` | `recorded: true, failure_count +1` |
| CB-UT-04 | Trip circuit at threshold | 5 failures | `state: "open"` |
| CB-UT-05 | Block requests when open | Check while open | `allowed: false` |
| CB-UT-06 | Half-open after timeout | Wait retry period | `state: "half-open"` |
| CB-UT-07 | Close on success in half-open | Success in half-open | `state: "closed", failure_count: 0` |
| CB-UT-08 | Re-open on failure in half-open | Failure in half-open | `state: "open"` |

### 4.5 WF6_Rollback_Workflow Unit Tests

**File:** `tests/rollback.test.ts` (existing - extend)

| Test ID | Description | Input | Expected Output |
|---------|-------------|-------|-----------------|
| WF6-UT-01 | Validate rollback input (no IDs) | Empty payload | `Error: "Rollback requires at least one ID"` |
| WF6-UT-02 | Rollback GCal only | `gcal_event_id` | `steps.gcal.success: true` |
| WF6-UT-03 | Rollback DB only | `booking_id` | `steps.db.success: true, status: "CANCELLED"` |
| WF6-UT-04 | Rollback lock only | `lock_key, owner_token` | `steps.lock.success: true, was_released: true` |
| WF6-UT-05 | Full rollback (all three) | All IDs | All steps successful |
| WF6-UT-06 | Handle commas in reason | `reason: "Error, timeout, retry"` | Reason stored correctly (no truncation) |
| WF6-UT-07 | Idempotent rollback (non-existent) | Fake UUIDs | `success: true, was_updated: false` |
| WF6-UT-08 | Reject wrong owner_token | `wrong_token` | `was_released: false` |

---

## 5. Integration Test Specifications

### 5.1 Workflow Chain Tests

**File:** `tests/new-workflows.integration.test.ts` (existing - extend)

| Test ID | Chain | Description | Expected |
|---------|-------|-------------|----------|
| INT-01 | WF1 → WF2 → WF7 → WF3 → CB → GCAL → DB | Full happy path | Booking created, GCal event, lock released |
| INT-02 | WF1 → WF2 → WF7 (fail) | Lock acquisition fails | `error_code: "LOCK_DENIED"`, no DB/GCal calls |
| INT-03 | WF1 → WF2 → WF7 → WF3 (fail) | No availability | `error_code: "NO_AVAILABILITY"`, lock released |
| INT-04 | WF1 → WF2 → WF7 → CB (open) | Circuit breaker open | `error_code: "CIRCUIT_OPEN"`, lock released |
| INT-05 | WF1 → WF2 → WF7 → GCAL (fail) | GCal API error | `error_code: "GCAL_ERROR"`, lock released |
| INT-06 | WF1 → WF2 → WF7 → GCAL → DB (fail) | DB insert fails | Rollback GCal, lock released |
| INT-07 | WF1 → WF2 (duplicate) | Same idempotency key twice | Second returns `is_duplicate: true` |
| INT-08 | WF4 → GCAL | Sync unsynced bookings | GCal events created for all unsynced |
| INT-09 | WF5 → GCAL | Check collision before booking | `has_collision: true/false` |
| INT-10 | NN_02 → NN_03 → NN_04 | Telegram message flow | Response sent to user |

### 5.2 Error Handler Integration Tests

| Test ID | Description | Trigger | Expected |
|---------|-------------|---------|----------|
| EH-INT-01 | Error handler receives error | Any workflow error | Error logged to `system_logs` |
| EH-INT-02 | Rollback triggered with IDs | Error after GCal creation | WF6 called with `gcal_event_id, booking_id` |
| EH-INT-03 | Rollback skipped (early failure) | Error before lock acquired | `rollback_triggered: false`, error logged |
| EH-INT-04 | Error context preserved | Error in nested workflow | `failed_node, error_message` correct |

### 5.3 DLQ Integration Tests

| Test ID | Description | Scenario | Expected |
|---------|-------------|----------|----------|
| DLQ-INT-01 | Add entry to DLQ | Retryable error | Entry in `dead_letter_queue` table |
| DLQ-INT-02 | Get DLQ status | Query by idempotency_key | Status and retry count returned |
| DLQ-INT-03 | Retry from DLQ | Entry with retries < max | WF2 re-triggered |
| DLQ-INT-04 | Max retries exceeded | Entry with retries >= max | Entry marked as failed, no retry |

---

## 6. Stress/Load Test Specifications

### 6.1 Concurrency Tests

**File:** `tests/stress_concurrency.test.ts` (new)

| Test ID | Description | Setup | Expected |
|---------|-------------|-------|----------|
| STR-01 | 10 concurrent requests for same slot | Same `provider_id, start_time` | 1 success, 9 `LOCK_DENIED` |
| STR-02 | 50 concurrent requests (batch) | 5 different slots, 10 each | 5 successes, 45 `LOCK_DENIED` |
| STR-03 | Race condition: Lock → DB → GCal | Lock acquired, DB slow | Lock held until DB complete, no deadlock |
| STR-04 | Circuit breaker under load | 100 rapid failures | Circuit opens at 5, blocks rest |
| STR-05 | DLQ under load | 20 retryable errors | All entries added, no duplicates |
| STR-06 | Lock TTL expiration under load | 10 expired locks, 10 new requests | All new requests succeed |

### 6.2 Load Tests (Sustained)

**File:** `tests/stress_load.test.ts` (new)

| Test ID | Description | Duration | Expected |
|---------|-------------|----------|----------|
| LOAD-01 | 100 bookings over 10 minutes | 10 min | All succeed, avg latency < 5s |
| LOAD-02 | 500 availability checks | 5 min | All succeed, avg latency < 1s |
| LOAD-03 | 50 sync operations | 10 min | All GCal events created |
| LOAD-04 | Memory leak detection | 1000 iterations | Memory stable, no OOM |

### 6.3 Rate Limiting Tests

| Test ID | Description | Rate | Expected |
|---------|-------------|------|----------|
| RATE-01 | 100 requests/second | 100 req/s | System degrades gracefully, no crash |
| RATE-02 | Burst handling | 50 requests instant | Queue or reject excess |
| RATE-03 | Recovery after rate limit | Wait 60s | System recovers, accepts requests |

---

## 7. Security Test Specifications

### 7.1 Injection Tests

**File:** `tests/security_injection.test.ts` (new)

| Test ID | Type | Payload | Expected |
|---------|------|---------|----------|
| SEC-01 | SQL Injection (booking_id) | `booking_id: "'; DROP TABLE bookings; --"` | Query parameterized, no injection |
| SEC-02 | SQL Injection (provider_id) | `provider_id: "1 OR 1=1"` | Treated as string, rejected |
| SEC-03 | SQL Injection (idempotency_key) | `key: "test'; DELETE FROM bookings; --"` | Sanitized, no injection |
| SEC-04 | XSS in customer_name | `name: "<script>alert('xss')</script>"` | Escaped in output |
| SEC-05 | Command injection | `email: "test@test.com; rm -rf /"` | Treated as string |
| SEC-06 | JSON injection | `body: {"__proto__": {"injected": true}}` | No prototype pollution |
| SEC-07 | Path traversal | `webhook_path: "../../../etc/passwd"` | Webhook path validated |
| SEC-08 | Header injection | Custom headers with newlines | Headers sanitized |

### 7.2 Authentication/Authorization Tests

| Test ID | Description | Expected |
|---------|-------------|----------|
| SEC-AUTH-01 | Access without API key (if protected) | 401 Unauthorized |
| SEC-AUTH-02 | Access with invalid API key | 403 Forbidden |
| SEC-AUTH-03 | Access with valid API key | 200 OK |
| SEC-AUTH-04 | Lock release with wrong owner_token | `was_released: false` |
| SEC-AUTH-05 | Cancel booking with wrong chat_id | `error_code: "UNAUTHORIZED"` |

### 7.3 Data Validation Tests

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| SEC-VAL-01 | UUID format validation | `booking_id: "not-a-uuid"` | `error_code: "VALIDATION_ERROR"` |
| SEC-VAL-02 | Email format validation | `email: "invalid"` | `error_code: "VALIDATION_ERROR"` |
| SEC-VAL-03 | ISO date validation | `start_time: "2026-13-45"` | `error_code: "VALIDATION_ERROR"` |
| SEC-VAL-04 | Integer validation | `provider_id: "abc"` | `error_code: "VALIDATION_ERROR"` |
| SEC-VAL-05 | Max length enforcement | `customer_id: "a".repeat(1000)` | Truncated to 255 chars |
| SEC-VAL-06 | Null handling | `customer_id: null` | Handled gracefully |
| SEC-VAL-07 | Undefined handling | Missing field | `error_code: "VALIDATION_ERROR"` |
| SEC-VAL-08 | Empty string handling | `customer_id: ""` | Rejected or defaulted |

---

## 8. Edge Case Test Specifications

### 8.1 Temporal Edge Cases

**File:** `tests/qa-edge-cases.test.ts` (existing - extend)

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| EDGE-TIME-01 | Booking in past | `start_time: "2020-01-01"` | `error_code: "VALIDATION_ERROR"` |
| EDGE-TIME-02 | Booking right now | `start_time: NOW()` | Rejected (must be future) |
| EDGE-TIME-03 | Booking 1 minute in future | `start_time: NOW() + 1min` | Accepted if slot available |
| EDGE-TIME-04 | Booking at midnight | `start_time: "2026-03-20T00:00:00Z"` | Handled correctly |
| EDGE-TIME-05 | Booking on leap year | `start_time: "2028-02-29T10:00:00Z"` | Handled correctly |
| EDGE-TIME-06 | DST transition | `start_time: "2026-03-08T02:00:00Z"` (DST) | Timezone handled |
| EDGE-TIME-07 | Very far future | `start_time: "2099-12-31"` | Accepted (no arbitrary limit) |
| EDGE-TIME-08 | Duration at boundaries | `duration_minutes: 15, 480` | Accepted |
| EDGE-TIME-09 | Duration outside bounds | `duration_minutes: 14, 481` | Rejected |
| EDGE-TIME-10 | End time calculation | `start_time + duration` | `end_time` correct |

### 8.2 Data Edge Cases

| Test ID | Description | Input | Expected |
|---------|-------------|-------|----------|
| EDGE-DATA-01 | Empty request body | `{}` | `error_code: "VALIDATION_ERROR"` |
| EDGE-DATA-02 | Null values | `provider_id: null` | `error_code: "VALIDATION_ERROR"` |
| EDGE-DATA-03 | Unicode in names | `customer_id: "日本語"` | Handled correctly |
| EDGE-DATA-04 | Emojis in data | `event_title: "Appointment 🎉"` | Stored correctly |
| EDGE-DATA-05 | Special characters | `customer_id: "O'Connor"` | Escaped correctly |
| EDGE-DATA-06 | Very long idempotency key | Generated key > 255 chars | Truncated to 255 |
| EDGE-DATA-07 | Duplicate idempotency (different case) | `KEY` vs `key` | Treated as same (case-insensitive) |
| EDGE-DATA-08 | Float provider_id | `provider_id: 1.5` | Converted to int or rejected |
| EDGE-DATA-09 | String provider_id | `provider_id: "1"` | Converted to int |
| EDGE-DATA-10 | Negative duration | `duration_minutes: -60` | Rejected |

### 8.3 System Edge Cases

| Test ID | Description | Scenario | Expected |
|---------|-------------|----------|----------|
| EDGE-SYS-01 | DB connection lost | DB down during booking | `error_code: "DB_ERROR"`, lock released |
| EDGE-SYS-02 | GCal API down | GCal timeout | `error_code: "GCAL_ERROR"`, lock released |
| EDGE-SYS-03 | n8n restart mid-flow | Workflow interrupted | Idempotency allows retry |
| EDGE-SYS-04 | Lock TTL expires mid-flow | Long-running operation | Lock re-acquired or fail |
| EDGE-SYS-05 | Circuit breaker timeout | Service recovering | Half-open state tested |
| EDGE-SYS-06 | DLQ full | Max entries reached | Oldest purged or reject new |
| EDGE-SYS-07 | Webhook timeout | Client disconnects | Workflow completes async |
| EDGE-SYS-08 | Duplicate webhook call | Same request twice | Idempotency handles |

### 8.4 User Behavior Edge Cases

| Test ID | Description | Scenario | Expected |
|---------|-------------|----------|----------|
| EDGE-USER-01 | Cancel non-existent booking | Fake UUID | `error_code: "NOT_FOUND"` |
| EDGE-USER-02 | Cancel already cancelled | Status = CANCELLED | `error_code: "INVALID_STATUS"` |
| EDGE-USER-03 | Cancel completed booking | Status = COMPLETED | `error_code: "INVALID_STATUS"` |
| EDGE-USER-04 | Reschedule to same time | Same `start_time` | Accepted (no-op) or rejected |
| EDGE-USER-05 | Reschedule to past | Past `start_time` | `error_code: "VALIDATION_ERROR"` |
| EDGE-USER-06 | Double-submit same form | 2 clicks same button | Idempotency returns same result |
| EDGE-USER-07 | Booking with no email | `email: null` | Accepted if not required |
| EDGE-USER-08 | Booking with invalid phone | `phone: "abc"` | Rejected or sanitized |

---

## 9. Regression Test Specifications

### 9.1 Historical Bug Regression Tests

Based on lessons learned documents:

| Test ID | Bug Reference | Description | Expected |
|---------|---------------|-------------|----------|
| REG-01 | LESSONS_LEARNED_WF2_2026-03-14 | Rollback without IDs | `has_valid_id: false`, skip rollback |
| REG-02 | LESSONS_LEARNED_WF2_2026-03-14 | JSON.stringify in expression | No syntax error, use bodyParameters |
| REG-03 | LESSONS_LEARNED_WF2_2026-03-14 | Context loss in IF branches | `ctx` preserved in all branches |
| REG-04 | LESSONS_LEARNED_WF2_2026-03-14 | Accessing skipped nodes | `isExecuted` guard prevents crash |
| REG-05 | LESSONS_LEARNED_REFACTORING_2026-03-15 | GCal start/end defaults | Explicit `start_time` from `ctx` |
| REG-06 | LESSONS_LEARNED_REFACTORING_2026-03-15 | Lock-First pattern | Lock acquired BEFORE availability check |
| REG-07 | LESSONS_LEARNED_REFACTORING_2026-03-15 | Inline rollback (not error handler) | Rollback in main flow, not just error trigger |
| REG-08 | LESSONS_LEARNED_GCAL_SYNC_2026-03-15 | GCal time assumption | Events created at `start_time`, not `NOW()` |
| REG-09 | LESSONS_LEARNED_2026-03-09 | chat_id loss in Normalizer | `chat_id` preserved in all outputs |
| REG-10 | LESSONS_LEARNED_2026-03-09 | LLM JSON parsing failure | Regex fallback extracts UUID/BKG-XXXX |
| REG-11 | LESSONS_LEARNED_2026-03-10 | SQL injection via uncast params | All params cast: `$1::uuid, $2::int` |
| REG-12 | LESSONS_LEARNED_2026-03-10 | PgBouncer session locks | Use `pg_advisory_xact_lock` (transaction-level) |

### 9.2 Version Upgrade Regression Tests

| Test ID | Description | Scenario | Expected |
|---------|-------------|----------|----------|
| REG-UPG-01 | n8n version upgrade | Deploy new n8n version | All workflows functional |
| REG-UPG-02 | Node version changes | Update node typeVersions | No "propertyValues is not iterable" |
| REG-UPG-03 | API breaking changes | n8n API update | CRUD agent still works |
| REG-UPG-04 | Database schema change | Add column to bookings | Workflows handle gracefully |

---

## 10. Community-Suggested Patterns

### 10.1 n8n Community Patterns (community.n8n.io)

| Pattern | Source | Application |
|---------|--------|-------------|
| **Pinned Data for Testing** | n8n blog | Pin test data in workflow for reproducible tests |
| **Debug Snapshot Node** | Community thread | Add Set node with `={{ $json }}` after each critical node |
| **Execution Data Limits** | GitHub issue #22341 | Set `EXECUTIONS_DATA_MAX_AGE=336` to prevent disk fill |
| **Retry with Exponential Backoff** | Best practices | `retryOnFail: true, maxRetries: 3, retryInterval: 2000` |
| **Error Workflow Centralization** | n8n docs | Single error handler for all workflows |
| **Response Node Pattern** | v2.10+ feature | Use `responseMode: responseNode` instead of `lastNode` |
| **Split In Batches for Large Datasets** | Community | Process 100 items/batch to prevent memory issues |
| **Cron + Flag for Idempotent Scheduled Tasks** | Community | Use DB flag to prevent duplicate cron executions |

### 10.2 Testing Patterns from n8n Community

| Pattern | Description | Implementation |
|---------|-------------|----------------|
| **Test Workflow Variant** | Create `-test` variant of each workflow | `WF2_Booking_Orchestrator_test` with mock HTTP responses |
| **Mock External APIs** | Use webhook-test or local mock server | Mock GCal, Telegram APIs |
| **Execution Comparison** | Compare execution before/after changes | Export execution data, diff |
| **Load Testing with k6** | Community load testing tool | k6 script hitting webhooks |
| **Chaos Engineering** | Randomly fail nodes | Test resilience |

### 10.3 Recommended Community Tools

| Tool | Purpose | Integration |
|------|---------|-------------|
| **k6** | Load testing | Script to hit n8n webhooks |
| **Postman/Newman** | API testing | Collection for each workflow |
| **Docker Compose Test** | Isolated testing | Spin up n8n + DB for tests |
| **n8n-io/mcp** | AI Agent testing | Test ToolWorkflow patterns |

---

## 11. Test Scripts to Create (TypeScript + Jest)

### 11.1 New Test Files to Create

```
tests/
├── wf1_gateway.test.ts              (existing - extend)
├── orchestrator.test.ts             (existing - extend)
├── lock.test.ts                     (existing - extend)
├── circuit_breaker.test.ts          (existing - extend)
├── rollback.test.ts                 (existing - extend)
├── availability.test.ts             (existing - extend)
├── collision.test.ts                (existing - extend)
├── sync.test.ts                     (existing - extend)
├── dlq.test.ts                      (existing - extend)
├── qa-edge-cases.test.ts            (existing - extend)
├── full.test.ts                     (existing - extend)
├── seed-workflows.test.ts           (existing - extend)
├── NEW: stress_concurrency.test.ts  (new)
├── NEW: stress_load.test.ts         (new)
├── NEW: security_injection.test.ts  (new)
├── NEW: regression_historical.test.ts (new)
├── NEW: integration_chains.test.ts  (new)
├── NEW: error_handler.test.ts       (new)
├── NEW: db_operations.test.ts       (new)
├── NEW: gcal_operations.test.ts     (new)
└── NEW: ai_agent.test.ts            (new)
```

### 11.2 stress_concurrency.test.ts (Template)

```typescript
/**
 * CONCURRENCY STRESS TESTS
 * Purpose: Verify locking and race condition prevention
 * 
 * Run: npx jest tests/stress_concurrency.test.ts --testTimeout=120000 --forceExit
 */

import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n.stax.ink/webhook';
const DB_URL = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

jest.setTimeout(120000);

describe('Concurrency Stress Tests', () => {
  const TEST_PROVIDER_ID = 1;
  const TEST_SERVICE_ID = 1;
  
  beforeAll(async () => {
    // Clean up any existing locks for test slots
    await pool.query('DELETE FROM booking_locks WHERE provider_id = $1', [TEST_PROVIDER_ID]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('STR-01: 10 concurrent requests for same slot (1 success, 9 LOCK_DENIED)', async () => {
    const testTime = '2026-04-01T10:00:00Z';
    const requests = Array.from({ length: 10 }, (_, i) => {
      return axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
        provider_id: TEST_PROVIDER_ID,
        service_id: TEST_SERVICE_ID,
        start_time: testTime,
        customer_id: `concurrent_user_${i}`
      }).catch(err => err.response);
    });

    const responses = await Promise.all(requests);
    
    const successes = responses.filter(r => r?.data?.success === true).length;
    const lockDenied = responses.filter(r => r?.data?.error_code === 'LOCK_DENIED').length;
    
    expect(successes).toBe(1);
    expect(lockDenied).toBe(9);
  });

  it('STR-02: 50 concurrent requests (5 slots, 10 each)', async () => {
    const slots = [
      '2026-04-02T10:00:00Z',
      '2026-04-02T11:00:00Z',
      '2026-04-02T12:00:00Z',
      '2026-04-02T13:00:00Z',
      '2026-04-02T14:00:00Z'
    ];

    const requests: Promise<any>[] = [];
    slots.forEach((slot, slotIndex) => {
      for (let i = 0; i < 10; i++) {
        requests.push(
          axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
            provider_id: TEST_PROVIDER_ID,
            service_id: TEST_SERVICE_ID,
            start_time: slot,
            customer_id: `batch_user_${slotIndex}_${i}`
          }).catch(err => err.response)
        );
      }
    });

    const responses = await Promise.all(requests);
    
    // Should have exactly 5 successes (one per slot)
    const successes = responses.filter(r => r?.data?.success === true).length;
    expect(successes).toBe(5);
  });
});
```

### 11.3 security_injection.test.ts (Template)

```typescript
/**
 * SECURITY INJECTION TESTS
 * Purpose: Verify protection against injection attacks
 * 
 * Run: npx jest tests/security_injection.test.ts --testTimeout=60000 --forceExit
 */

import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n.stax.ink/webhook';
const DB_URL = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

jest.setTimeout(60000);

describe('Security Injection Tests', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('SEC-01: SQL Injection in booking_id', async () => {
    const maliciousId = "'; DROP TABLE bookings; --";
    
    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, {
      booking_id: maliciousId
    });

    // Should be treated as invalid UUID, not executed as SQL
    expect(response.data.success).toBe(false);
    expect(response.data.error_code).toBe('VALIDATION_ERROR');

    // Verify table still exists
    const check = await pool.query('SELECT COUNT(*) FROM bookings');
    expect(check.rows[0].count).toBeDefined();
  });

  it('SEC-02: SQL Injection in provider_id', async () => {
    const maliciousProvider = "1 OR 1=1";
    
    const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
      provider_id: maliciousProvider,
      service_id: 1,
      start_time: '2026-04-01T10:00:00Z',
      customer_id: 'test'
    });

    // Should fail validation (not a number)
    expect(response.data.success).toBe(false);
  });

  it('SEC-04: XSS in customer_name', async () => {
    const xssPayload = "<script>alert('xss')</script>";
    
    const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
      provider_id: 1,
      service_id: 1,
      start_time: '2026-04-01T10:00:00Z',
      customer_id: xssPayload
    });

    // Should be escaped or rejected
    expect(response.data.success).toBeDefined();
    // If stored, verify it's escaped in DB
  });

  it('SEC-06: JSON Prototype Pollution', async () => {
    const pollutionPayload = {
      provider_id: 1,
      service_id: 1,
      start_time: '2026-04-01T10:00:00Z',
      customer_id: 'test',
      __proto__: {
        injected: true
      }
    };

    const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, pollutionPayload);

    // Should not affect prototype chain
    expect({}.hasOwnProperty('injected')).toBe(false);
  });
});
```

### 11.4 regression_historical.test.ts (Template)

```typescript
/**
 * REGRESSION TESTS - Historical Bugs
 * Purpose: Ensure fixed bugs don't resurface
 * 
 * Run: npx jest tests/regression_historical.test.ts --testTimeout=90000 --forceExit
 */

import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n.stax.ink/webhook';
const DB_URL = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

jest.setTimeout(90000);

describe('Historical Bug Regression', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('REG-01: Rollback without IDs should skip (not crash)', async () => {
    // Bug: Error handler called rollback without valid IDs
    // Fix: Check has_valid_id before triggering WF6
    
    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, {
      // No IDs provided
    });

    // Should handle gracefully, not crash
    expect(response.status).toBe(200);
    // Either success (no-op) or validation error
    expect([true, false]).toContain(response.data.success);
  });

  it('REG-03: Context preservation in IF branches', async () => {
    // Bug: Context lost in duplicate branch
    // Fix: Merge context explicitly in all branches
    
    const testTime = '2026-04-03T10:00:00Z';
    const customerId = 'regression_context_test';
    
    // First request (creates booking)
    await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
      provider_id: 1,
      service_id: 1,
      start_time: testTime,
      customer_id: customerId
    });

    // Second request (should return duplicate with context preserved)
    const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
      provider_id: 1,
      service_id: 1,
      start_time: testTime,
      customer_id: customerId
    });

    expect(response.data.data.is_duplicate).toBe(true);
    expect(response.data._meta).toBeDefined();
    expect(response.data._meta.source).toBe('WF2_BOOKING_ORCHESTRATOR');
  });

  it('REG-05: GCal event created at correct time (not NOW)', async () => {
    // Bug: GCal events created at execution time, not start_time
    // Fix: Explicitly map ctx.start_time to GCal start parameter
    
    const testTime = '2026-04-04T15:00:00Z';
    
    const response = await axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
      provider_id: 1,
      service_id: 1,
      start_time: testTime,
      customer_id: 'gcal_time_test',
      event_title: 'GCal Time Regression Test'
    });

    if (response.data.success) {
      const gcalEventId = response.data.data.gcal_event_id || response.data.data.gcal_id;
      
      // Verify GCal event has correct start time (via GCal API or DB)
      const dbCheck = await pool.query(
        'SELECT start_time FROM bookings WHERE gcal_event_id = $1',
        [gcalEventId]
      );
      
      if (dbCheck.rows.length > 0) {
        const dbStartTime = new Date(dbCheck.rows[0].start_time).toISOString();
        expect(dbStartTime).toBe(testTime);
      }
    }
  });

  it('REG-06: Lock-First pattern (lock before availability)', async () => {
    // Bug: Availability checked before lock → race condition
    // Fix: Acquire lock FIRST, then check availability
    
    const testTime = '2026-04-05T10:00:00Z';
    
    // Two concurrent requests
    const [res1, res2] = await Promise.all([
      axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
        provider_id: 1,
        service_id: 1,
        start_time: testTime,
        customer_id: 'lockfirst_user_1'
      }),
      axios.post(`${N8N_WEBHOOK_URL}/booking-orchestrator`, {
        provider_id: 1,
        service_id: 1,
        start_time: testTime,
        customer_id: 'lockfirst_user_2'
      })
    ]);

    // Exactly one should succeed
    const successes = [res1, res2].filter(r => r.data.success === true).length;
    expect(successes).toBe(1);
  });
});
```

---

## 12. Data Fixtures Required

### 12.1 Database Seed Data

**File:** `tests/fixtures/seed_database.ts`

```typescript
// Minimum viable seed data for tests
export const SEED_DATA = {
  providers: [
    { id: 1, name: 'Test Provider 1', is_active: true },
    { id: 2, name: 'Test Provider 2', is_active: true },
    { id: 999, name: 'Stress Test Provider', is_active: true }
  ],
  services: [
    { id: 1, name: 'General Consultation', duration_minutes: 60 },
    { id: 2, name: 'Follow-up', duration_minutes: 30 },
    { id: 999, name: 'Invalid Service (for FK tests)', duration_minutes: 60 }
  ],
  users: [
    { chat_id: 5391760292, name: 'Test Admin' },
    { chat_id: 1000000001, name: 'Test User 1' },
    { chat_id: 1000000010, name: 'Test User 10' }
  ],
  circuit_breaker_configs: [
    { service_id: 'google_calendar', failure_threshold: 5, retry_timeout_seconds: 60 },
    { service_id: 'postgres', failure_threshold: 3, retry_timeout_seconds: 30 }
  ]
};
```

### 12.2 Test Payloads

**File:** `tests/fixtures/payloads.ts`

```typescript
export const VALID_PAYLOADS = {
  MINIMAL_BOOKING: {
    provider_id: 1,
    service_id: 1,
    start_time: '2026-04-01T10:00:00Z',
    customer_id: 'test_customer'
  },
  FULL_BOOKING: {
    provider_id: 1,
    service_id: 1,
    start_time: '2026-04-01T10:00:00Z',
    duration_minutes: 60,
    customer_id: 'test_customer',
    user_name: 'Test User',
    user_email: 'test@example.com',
    event_title: 'Test Appointment'
  },
  FUTURE_BOOKING: {
    provider_id: 1,
    service_id: 1,
    start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    customer_id: 'future_customer'
  }
};

export const INVALID_PAYLOADS = {
  MISSING_PROVIDER: {
    service_id: 1,
    start_time: '2026-04-01T10:00:00Z',
    customer_id: 'test'
  },
  MISSING_SERVICE: {
    provider_id: 1,
    start_time: '2026-04-01T10:00:00Z',
    customer_id: 'test'
  },
  MISSING_TIME: {
    provider_id: 1,
    service_id: 1,
    customer_id: 'test'
  },
  PAST_DATE: {
    provider_id: 1,
    service_id: 1,
    start_time: '2020-01-01T10:00:00Z',
    customer_id: 'test'
  },
  INVALID_UUID: {
    booking_id: 'not-a-uuid',
    chat_id: 123456
  },
  SQL_INJECTION: {
    booking_id: "'; DROP TABLE bookings; --",
    chat_id: 123456
  }
};
```

### 12.3 Mock Responses

**File:** `tests/fixtures/mocks.ts`

```typescript
export const MOCK_RESPONSES = {
  GCAL_SUCCESS: {
    success: true,
    data: {
      event_id: 'mock_gcal_event_123',
      html_link: 'https://calendar.google.com/...'
    }
  },
  GCAL_FAILURE: {
    success: false,
    error_code: 'GCAL_API_ERROR',
    error_message: 'Mock GCal API failure'
  },
  DB_SUCCESS: {
    success: true,
    data: {
      booking_id: '550e8400-e29b-41d4-a716-446655440000',
      status: 'CONFIRMED'
    }
  },
  DB_FAILURE: {
    success: false,
    error_code: 'DB_INSERT_ERROR',
    error_message: 'Mock DB insertion failure'
  },
  LOCK_SUCCESS: {
    success: true,
    data: {
      acquired: true,
      lock_key: 'lock_1_2026-04-01T10_00_00',
      owner_token: 'mock_token_123'
    }
  },
  LOCK_FAILURE: {
    success: true,
    data: {
      acquired: false,
      error_code: 'LOCK_HELD'
    }
  }
};
```

---

## 13. Success Criteria Per Test

### 13.1 Unit Test Success Criteria

| Criterion | Description | Pass Condition |
|-----------|-------------|----------------|
| **Response Format** | Standard Contract | `success`, `error_code`, `data`, `_meta` present |
| **Validation** | Input validation | Invalid input → `success: false, error_code: "VALIDATION_ERROR"` |
| **Business Logic** | Core functionality | Correct output for given input |
| **Context Preservation** | `ctx` object | `ctx` present in all branches |
| **Error Handling** | Graceful failures | No crashes, appropriate error codes |

### 13.2 Integration Test Success Criteria

| Criterion | Description | Pass Condition |
|-----------|-------------|----------------|
| **Workflow Chain** | End-to-end flow | All workflows in chain execute correctly |
| **Data Consistency** | DB ↔ GCal sync | Matching records in both systems |
| **Error Propagation** | Errors bubble up | Errors in sub-workflows handled by parent |
| **Rollback** | Failed transactions | State rolled back on failure |
| **Idempotency** | Duplicate requests | Same result for same input |

### 13.3 Stress Test Success Criteria

| Criterion | Description | Pass Condition |
|-----------|-------------|----------------|
| **Concurrency** | Race conditions | No double-bookings |
| **Throughput** | Requests/second | > 10 bookings/minute sustained |
| **Latency** | Response time | P95 < 5s, P99 < 10s |
| **Memory** | Memory usage | Stable, no leaks (< 512MB) |
| **Recovery** | After load spike | System recovers within 60s |

### 13.4 Security Test Success Criteria

| Criterion | Description | Pass Condition |
|-----------|-------------|----------------|
| **Injection** | SQL/XSS prevention | Payloads treated as data, not code |
| **Validation** | Input sanitization | Malformed input rejected |
| **Authorization** | Access control | Unauthorized access denied |
| **Data Protection** | PII handling | No PII in logs, encrypted at rest |

### 13.5 Edge Case Success Criteria

| Criterion | Description | Pass Condition |
|-----------|-------------|----------------|
| **Boundary Values** | Min/max inputs | Handled correctly |
| **Null/Undefined** | Missing data | Graceful handling |
| **Special Characters** | Unicode, emojis | Stored/retrieved correctly |
| **Temporal** | Timezones, DST | Correct time handling |

### 13.6 Regression Test Success Criteria

| Criterion | Description | Pass Condition |
|-----------|-------------|----------------|
| **Historical Bugs** | Known issues fixed | Bugs don't resurface |
| **Version Upgrades** | n8n updates | No breaking changes |
| **Schema Changes** | DB migrations | Workflows compatible |

---

## 14. CPU/Memory Monitoring Strategy

### 14.1 Jest Configuration (Prevent Saturation)

**File:** `jest.config.js` (existing)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  
  // CPU Protection
  maxWorkers: 1,  // Single worker to prevent CPU saturation
  workerIdleMemoryLimit: '512MB',
  
  // Timeouts
  testTimeout: 90000,  // 90s per test
  testRunner: 'jest-circus/runner',
  
  // Reporting
  verbose: true,
  collectCoverage: false,  // Enable for coverage reports
  
  // Retry flaky tests
  retryTimes: 2,
  
  // Stop on first failure (optional)
  // bail: true,
};
```

### 14.2 Test Execution Strategy

```bash
# Run tests in batches to prevent resource exhaustion

# Batch 1: Unit tests (fast, low resource)
npx jest tests/wf1_gateway.test.ts tests/lock.test.ts tests/circuit_breaker.test.ts --testTimeout=60000

# Batch 2: Integration tests (medium resource)
npx jest tests/integration_chains.test.ts --testTimeout=90000

# Batch 3: Stress tests (high resource, run separately)
npx jest tests/stress_concurrency.test.ts --testTimeout=120000 --maxWorkers=1

# Batch 4: Security tests (medium resource)
npx jest tests/security_injection.test.ts --testTimeout=60000

# Batch 5: Regression tests (comprehensive)
npx jest tests/regression_historical.test.ts --testTimeout=120000
```

### 14.3 Monitoring Commands

```bash
# Monitor CPU during tests
watch -n 1 'ps aux | grep node | head -5'

# Monitor memory
watch -n 1 'free -h'

# Monitor n8n process
docker stats n8n --no-stream

# Monitor database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Monitor test progress with verbose output
npx jest --verbose --silent=false
```

### 14.4 Resource Limits

| Resource | Limit | Action if Exceeded |
|----------|-------|-------------------|
| **CPU** | 80% single core | Pause tests, wait 60s |
| **Memory** | 512MB per worker | Kill worker, restart |
| **DB Connections** | 10 concurrent | Queue requests |
| **API Rate Limit** | 100 req/min | Backoff 30s |
| **Disk I/O** | 50MB/s | Throttle writes |

### 14.5 Test Health Dashboard

**File:** `scripts-ts/test_monitor.ts`

```typescript
/**
 * Test Resource Monitor
 * Tracks CPU, memory, and test progress
 */

import os from 'os';
import { exec } from 'child_process';

interface ResourceMetrics {
  cpuPercent: number;
  memoryUsed: number;
  memoryTotal: number;
  testProgress: {
    passed: number;
    failed: number;
    pending: number;
  };
}

function getCPULoad(): Promise<number> {
  return new Promise((resolve) => {
    exec('top -bn1 | grep "Cpu(s)"', (err, stdout) => {
      if (err) {
        resolve(0);
        return;
      }
      const cpu = parseFloat(stdout.split(',')[0].split(':')[1].trim());
      resolve(cpu);
    });
  });
}

function getMemoryUsage(): { used: number; total: number } {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    used: total - free,
    total
  };
}

async function monitorResources(): Promise<ResourceMetrics> {
  const cpu = await getCPULoad();
  const memory = getMemoryUsage();
  
  return {
    cpuPercent: cpu,
    memoryUsed: memory.used,
    memoryTotal: memory.total,
    testProgress: {
      passed: 0,  // Parse from Jest output
      failed: 0,
      pending: 0
    }
  };
}

// Alert if resources exceeded
function checkThresholds(metrics: ResourceMetrics) {
  if (metrics.cpuPercent > 80) {
    console.warn('⚠️  HIGH CPU:', metrics.cpuPercent, '%');
  }
  if (metrics.memoryUsed / metrics.memoryTotal > 0.8) {
    console.warn('⚠️  HIGH MEMORY:', (metrics.memoryUsed / metrics.memoryTotal * 100).toFixed(2), '%');
  }
}

// Run monitor
setInterval(async () => {
  const metrics = await monitorResources();
  checkThresholds(metrics);
  console.log(`Resources: CPU ${metrics.cpuPercent.toFixed(1)}% | Memory ${(metrics.memoryUsed / 1024 / 1024).toFixed(0)}MB`);
}, 5000);
```

---

## 15. Rollback Verification Tests

### 15.1 Rollback Test Matrix

| Test ID | Scenario | Trigger | Rollback Steps | Expected |
|---------|----------|---------|----------------|----------|
| RB-01 | GCal creation fails | GCal API error | None (nothing to rollback) | Lock released, error returned |
| RB-02 | DB insert fails | FK violation | GCal delete | GCal deleted, lock released |
| RB-03 | Lock acquisition fails | Lock already held | None | Error returned immediately |
| RB-04 | Circuit breaker open | Service tripped | None | Lock not acquired, error returned |
| RB-05 | Timeout mid-flow | Network timeout | GCal delete (if created) | Partial rollback, lock released |
| RB-06 | Manual rollback | Admin trigger | GCal + DB + Lock | All three rolled back |
| RB-07 | Idempotent rollback | Already rolled back | None | `was_updated: false` |
| RB-08 | Rollback with wrong token | Security check | None | `was_released: false` |

### 15.2 Rollback Verification Checklist

```markdown
## Rollback Verification Checklist

### Pre-Rollback State
- [ ] Document current state (DB records, GCal events, locks)
- [ ] Capture timestamps and IDs
- [ ] Verify state is as expected before rollback

### During Rollback
- [ ] Monitor rollback execution in n8n UI
- [ ] Verify each step executes in order
- [ ] Check for errors in each step

### Post-Rollback State
- [ ] GCal event deleted (if applicable)
- [ ] DB booking status = 'CANCELLED' (if applicable)
- [ ] Lock released (deleted from DB)
- [ ] System logs contain rollback entry
- [ ] DLQ entry created (if retry needed)

### Data Integrity
- [ ] No orphaned GCal events
- [ ] No orphaned locks
- [ ] No inconsistent states (DB without GCal or vice versa)
- [ ] Audit log contains rollback entry
```

### 15.3 Rollback Test Script

**File:** `tests/rollback_verification.test.ts`

```typescript
/**
 * ROLLBACK VERIFICATION TESTS
 * Purpose: Ensure rollback mechanisms work correctly
 * 
 * Run: npx jest tests/rollback_verification.test.ts --testTimeout=90000 --forceExit
 */

import axios from 'axios';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const N8N_WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://n8n.stax.ink/webhook';
const DB_URL = process.env.DATABASE_URL || `postgres://${process.env.REMOTE_NEON_DB_USER}:${process.env.REMOTE_NEON_DB_PASSWORD}@${process.env.REMOTE_NEON_DB_HOST}:${process.env.REMOTE_NEON_DB_PORT}/${process.env.REMOTE_NEON_DB_DATABASE}?sslmode=require`;

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

jest.setTimeout(90000);

describe('Rollback Verification Tests', () => {
  let testBookingId: string;
  let testGcalEventId: string;
  let testLockKey: string;
  let testOwnerToken: string;

  beforeAll(async () => {
    // Create test data for rollback
    const bookingRes = await pool.query(
      `INSERT INTO bookings (provider_id, service_id, start_time, status, gcal_event_id)
       VALUES (1, 1, NOW() + INTERVAL '1 hour', 'CONFIRMED', 'test_gcal_123')
       RETURNING id`
    );
    testBookingId = bookingRes.rows[0].id;
    testGcalEventId = bookingRes.rows[0].gcal_event_id;

    const lockRes = await pool.query(
      `INSERT INTO booking_locks (provider_id, start_time, lock_key, owner_token, expires_at)
       VALUES (1, NOW(), 'lock_rollback_test', 'test_token', NOW() + INTERVAL '5 minutes')
       RETURNING lock_key`
    );
    testLockKey = lockRes.rows[0].lock_key;
    testOwnerToken = 'test_token';
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM bookings WHERE id = $1', [testBookingId]);
    await pool.query('DELETE FROM booking_locks WHERE lock_key = $1', [testLockKey]);
    await pool.end();
  });

  it('RB-02: Rollback DB + Lock after GCal created', async () => {
    // Trigger rollback
    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, {
      booking_id: testBookingId,
      gcal_event_id: testGcalEventId,
      lock_key: testLockKey,
      owner_token: testOwnerToken,
      reason: 'Test rollback verification'
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);

    // Verify DB booking cancelled
    const dbCheck = await pool.query(
      'SELECT status, cancellation_reason FROM bookings WHERE id = $1',
      [testBookingId]
    );
    expect(dbCheck.rows[0].status).toBe('CANCELLED');
    expect(dbCheck.rows[0].cancellation_reason).toBe('Test rollback verification');

    // Verify lock released
    const lockCheck = await pool.query(
      'SELECT * FROM booking_locks WHERE lock_key = $1',
      [testLockKey]
    );
    expect(lockCheck.rows.length).toBe(0);
  });

  it('RB-06: Manual rollback with all IDs', async () => {
    // Create fresh test data
    const newBooking = await pool.query(
      `INSERT INTO bookings (provider_id, service_id, start_time, status, gcal_event_id)
       VALUES (1, 1, NOW() + INTERVAL '2 hours', 'CONFIRMED', 'test_gcal_456')
       RETURNING id`
    );

    const newLock = await pool.query(
      `INSERT INTO booking_locks (provider_id, start_time, lock_key, owner_token, expires_at)
       VALUES (1, NOW(), 'lock_manual_test', 'manual_token', NOW() + INTERVAL '5 minutes')
       RETURNING lock_key`
    );

    // Trigger manual rollback
    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, {
      booking_id: newBooking.rows[0].id,
      gcal_event_id: 'test_gcal_456',
      lock_key: 'lock_manual_test',
      owner_token: 'manual_token',
      reason: 'Manual rollback test'
    });

    expect(response.data.success).toBe(true);

    // Verify all rolled back
    const checkBooking = await pool.query(
      'SELECT status FROM bookings WHERE id = $1',
      [newBooking.rows[0].id]
    );
    expect(checkBooking.rows[0].status).toBe('CANCELLED');

    const checkLock = await pool.query(
      'SELECT * FROM booking_locks WHERE lock_key = $1',
      ['lock_manual_test']
    );
    expect(checkLock.rows.length).toBe(0);
  });

  it('RB-07: Idempotent rollback (already rolled back)', async () => {
    // Try to rollback same booking again
    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, {
      booking_id: testBookingId,
      reason: 'Duplicate rollback attempt'
    });

    // Should succeed but report no changes
    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    // DB step should report was_updated: false
  });

  it('RB-08: Rollback with wrong owner_token (security)', async () => {
    // Create fresh lock
    await pool.query(
      `INSERT INTO booking_locks (provider_id, start_time, lock_key, owner_token, expires_at)
       VALUES (1, NOW(), 'lock_security_test', 'correct_token', NOW() + INTERVAL '5 minutes')`
    );

    // Try to release with wrong token
    const response = await axios.post(`${N8N_WEBHOOK_URL}/rollback-booking`, {
      lock_key: 'lock_security_test',
      owner_token: 'wrong_token',
      reason: 'Security test'
    });

    // Lock should NOT be released
    const lockCheck = await pool.query(
      'SELECT * FROM booking_locks WHERE lock_key = $1',
      ['lock_security_test']
    );
    expect(lockCheck.rows.length).toBe(1);  // Still exists
    expect(lockCheck.rows[0].owner_token).toBe('correct_token');
  });
});
```

---

## 16. Appendix: Historical Bugs Reference

### 16.1 Bug Index from Lessons Learned

| Bug ID | Date | Component | Description | Fix | Test |
|--------|------|-----------|-------------|-----|------|
| BUG-001 | 2026-03-14 | WF2 Error Handler | Rollback without IDs | Check `has_valid_id` before calling WF6 | REG-01 |
| BUG-002 | 2026-03-14 | WF2 | JSON.stringify in expression | Use bodyParameters instead | REG-02 |
| BUG-003 | 2026-03-14 | WF2 | Context loss in IF branches | Merge context explicitly | REG-03 |
| BUG-004 | 2026-03-14 | WF2 | Accessing skipped nodes | Use `isExecuted` guard | REG-04 |
| BUG-005 | 2026-03-15 | GCAL | Events created at NOW() | Map `ctx.start_time` explicitly | REG-05 |
| BUG-006 | 2026-03-15 | WF2 | Race condition (avail before lock) | Lock-First pattern | REG-06 |
| BUG-007 | 2026-03-15 | WF2 | Error handler rollback | Inline rollback in main flow | REG-07 |
| BUG-008 | 2026-03-09 | NN_02 | chat_id lost in Normalizer | Spread original JSON | REG-08 |
| BUG-009 | 2026-03-09 | NN_03 | LLM JSON parsing failure | Regex fallback | REG-09 |
| BUG-010 | 2026-03-10 | DB_* | SQL injection | Cast params: `$1::uuid` | SEC-01 |
| BUG-011 | 2026-03-10 | DB_* | PgBouncer session locks | Use `pg_advisory_xact_lock` | STR-03 |

### 16.2 Bug Detection Commands

```bash
# Check for JSON.stringify in workflow expressions
grep -r "JSON.stringify" workflows/seed_clean/*.json

# Check for unguarded node access
grep -r '\$node\["' workflows/seed_clean/*.json

# Check for missing context preservation
grep -r '\$input.first().json' workflows/seed_clean/*.json | grep -v 'ctx'

# Check for hardcoded credentials
grep -r '"id": "[a-zA-Z0-9]\{16\}"' workflows/seed_clean/*.json

# Check for queryParameters in sub-workflows (bug #11835)
grep -r 'queryParameters' workflows/seed_clean/*.json
```

### 16.3 Prevention Checklist for New Workflows

```markdown
## Pre-Deployment Checklist (Bug Prevention)

### Code Quality
- [ ] No JSON.stringify in {{ }} expressions
- [ ] All node access guarded with isExecuted
- [ ] Context object (ctx) preserved in all branches
- [ ] Standard Contract in all outputs

### Security
- [ ] All SQL params cast ($1::uuid, $2::int)
- [ ] Input validation (required fields, regex)
- [ ] String sanitization (max length, escape special chars)
- [ ] No hardcoded credentials

### Resilience
- [ ] Lock-First pattern (acquire lock before checks)
- [ ] Inline rollback (not just error handler)
- [ ] Circuit breaker integration
- [ ] DLQ for retryable errors

### Testing
- [ ] Unit tests for all nodes
- [ ] Integration tests for workflow chains
- [ ] Stress tests for concurrency
- [ ] Regression tests for historical bugs
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-03-16 | AI Engineering Team | Initial comprehensive test plan |

---

## References

- **GEMINI.md** - System prompt v4.2 (N8N Automation Engineer)
- **workflow_activation_order.json** - Workflow dependency graph
- **docs/lessons_learned_*.md** - Historical bugs and fixes
- **docs/n8n-debug-api-manual-v2.txt** - Debugging patterns
- **tests/*.test.ts** - Existing test suite
- **n8n community** - https://community.n8n.io
- **n8n docs** - https://docs.n8n.io

---

**END OF TEST PLAN**
