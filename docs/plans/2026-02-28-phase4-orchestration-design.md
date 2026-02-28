# Phase 4: External Services & Final Orchestration - Implementation Plan

**Date:** 2026-02-28  
**Status:** In Progress  
**Author:** AI Assistant (following GEMINI.md v3.0)

---

## 📋 Overview

This document outlines the remaining tasks to complete Phase 4 of the Booking System Titanium project, focusing on E2E flow completion, Telegram error handling, and security compliance.

---

## 🎯 Remaining Tasks (from TODO.md)

### Task 1: Fix E2E Full Flow - Jest 500 Errors
**Priority:** HIGH  
**Status:** In Progress  
**Estimated Effort:** 2-3 hours

**Problem:** Tests are failing with HTTP 500 errors during E2E execution.

**Root Cause Analysis:**
1. Check `NN_03_AI_Agent` output format → `Format Success (POST)` node
2. Verify `NN_04_Telegram_Sender` input expectations
3. Validate Standard Contract propagation between workflows

**Implementation Steps:**
1. Review test output logs to identify exact failure point
2. Verify `NN_03` output matches `NN_04` input contract:
   - `NN_03` outputs: `{ data: { chat_id, ai_response }, ... }`
   - `NN_04` expects: `{ data: { chat_id, ai_response }, ... }` ✓ (should match)
3. Check if error originates from:
   - Groq API timeout (increase test timeout)
   - Missing credentials in test environment
   - Validation Sandwich failure in `NN_04`

**Fix Approach:**
```typescript
// In nn04_telegram_sender.test.ts - ensure proper payload structure
const payload = {
    data: {
        chat_id: process.env.TEST_CHAT_ID || "123456789",
        ai_response: "Test response message"
    }
};
```

**Verification:**
- `npx jest tests/nn04_telegram_sender.test.ts --testTimeout=60000`
- Manual webhook test: `curl -X POST https://n8n.stax.ink/webhook/nn04-telegram-sender -d '{"data":{"chat_id":"123","ai_response":"test"}}'`

---

### Task 2: Telegram API Error Handling (Character Escaping)
**Priority:** HIGH  
**Status:** Pending  
**Estimated Effort:** 1-2 hours

**Problem:** Telegram API fails with parse_mode errors when AI response contains special characters (markdown/HTML).

**Current State:**
```json
{
  "parse_mode": ""  // Currently disabled in NN_04
}
```

**Solution: String Sanitization [SEC_02]**

Add sanitization node before Telegram send:

```javascript
// Code Node: "Sanitize for Telegram"
const text = $input.first()?.json?.ai_response || "";

// Escape backslashes first, then quotes
const sanitized = text
  .replace(/\\/g, '\\\\')      // Escape backslashes
  .replace(/_/g, '\\_')        // Escape underscores (Markdown)
  .replace(/\*/g, '\\*')       // Escape asterisks
  .replace(/\[/g, '\\[')       // Escape brackets
  .replace(/`/g, '\\`')        // Escape backticks
  .substring(0, 4096);         // Telegram max length

return [{ json: { ...$input.first().json, sanitized_text: sanitized } }];
```

**Implementation Location:**
- Insert between `Format Success (POST)` and `Telegram` node in `NN_04`
- Update `Telegram` node to use `{{ $json.sanitized_text }}`

**Testing:**
```typescript
// Add test case with special characters
const specialCharPayload = {
    data: {
        chat_id: "123456789",
        ai_response: "Test *bold* _italic_ `code` [link](url)"
    }
};
```

---

### Task 3: Red Team Security Audit
**Priority:** MEDIUM  
**Status:** Pending  
**Estimated Effort:** 2-4 hours

**Compliance Checklist [GEMINI.md Section 8]:**

| Metric | Target | Verification Method |
|--------|--------|---------------------|
| Test Coverage | ≥80% | `npx jest --coverage` |
| Compliance Score | ≥0.8 | `npx tsx scripts-ts/red_team_audit_bbXX.ts` |
| Triple Entry Pattern | 100% | Visual inspection + `add_manual_triggers.ts` |
| Standard Contract | 100% | `workflow_validator.ts` |

**Audit Steps:**

1. **SQL Injection Prevention [SEC_01]:**
   - Review all Postgres nodes for VRF pattern compliance
   - Verify UUID validation before query interpolation

2. **Input Validation [PROHIBIDO_05]:**
   - Confirm all webhooks have PRE-validation nodes
   - Check regex patterns match [REGEX_WHITELIST]

3. **Credential Security [PROHIBIDO_02]:**
   - Verify no hardcoded API keys in workflow JSON
   - Confirm N8N Credentials usage (Groq, Telegram)

4. **Error Handling:**
   - Confirm all workflows route to `NN_00_Global_Error_Handler`
   - Verify error messages don't leak sensitive data

5. **Run Automated Audit:**
   ```bash
   npx tsx scripts-ts/red_team_audit_bbXX.ts --workflow NN_01
   npx tsx scripts-ts/red_team_audit_bbXX.ts --workflow NN_02
   npx tsx scripts-ts/red_team_audit_bbXX.ts --workflow NN_03
   npx tsx scripts-ts/red_team_audit_bbXX.ts --workflow NN_04
   ```

---

## 📊 Updated TODO.md Plan

```markdown
## 🏗️ Phase 4: External Services & Final Orchestration

- [x] **NN_04_Telegram_Sender.json**: Implement dispatcher (PRE/POST checks).
- [x] **Orchestration**: Link `NN_01` ➔ `NN_02` ➔ `NN_03` ➔ `NN_04`.
- [x] **Guards & Validation**: Added "Verify" nodes in `NN_01` (Sandwich Pattern).
- [ ] **E2E Full Flow**: 
  - [ ] Debug Jest 500 errors (check Standard Contract propagation)
  - [ ] Create `tests/nn04_telegram_sender.test.ts`
  - [ ] Create `tests/nn_full_orchestration.test.ts`
- [ ] **Fix: Telegram Error Handling**:
  - [ ] Add "Sanitize for Telegram" Code node
  - [ ] Test with special characters payload
  - [ ] Update parse_mode configuration
- [ ] **Red Team Audit**:
  - [ ] Run compliance checks (target: ≥0.8 score)
  - [ ] Fix any security violations
  - [ ] Document compliance in README

## 🎯 Phase 5: Production Readiness (Next)

- [ ] Load testing (concurrent bookings)
- [ ] Monitoring dashboard setup
- [ ] Documentation completion
- [ ] Deployment runbook
```

---

## 🔧 Required Scripts

Create test file for NN_04:

```typescript
// tests/nn04_telegram_sender.test.ts
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config({ path: __dirname + '/../.env' });

const WEBHOOK_BASE = process.env.WEBHOOK_URL || 'https://n8n.stax.ink';
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook/nn04-telegram-sender`;

describe('NN_04_Telegram_Sender E2E', () => {
    it('should send valid message to Telegram', async () => {
        const payload = {
            data: {
                chat_id: process.env.TEST_CHAT_ID || "123456789",
                ai_response: "Your booking is confirmed!"
            }
        };
        
        const response = await axios.post(WEBHOOK_URL, payload);
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
    }, 15000);
});
```

---

## ✅ Success Criteria

Phase 4 is complete when:

1. ✅ All 4 workflows (NN_01 → NN_04) pass E2E tests
2. ✅ Telegram messages send successfully with special characters
3. ✅ Red Team audit score ≥ 0.8 for all workflows
4. ✅ Test coverage ≥ 80%
5. ✅ Full orchestration flow documented

---

## 📚 References

- [GEMINI.md v3.0](../GEMINI.md) - System prompt & patterns
- [TODO.md](../TODO.md) - Project roadmap
- [N8N Docs](https://docs.n8n.io) - Official documentation
