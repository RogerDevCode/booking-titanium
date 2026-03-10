# 🧠 LESSONS LEARNED - BOOKING TITANIUM (2026-03-10)

## ✅ DO (Best Practices)
- **Concurrency**: Use `pg_advisory_xact_lock(hashtext(p_id || time)::bigint)` in DAL for atomic slots.
- **Security**: Sanitize names/emails with strict Regex Whitelist before DB insert (SEC04).
- **Validation**: Enforce `start_time > now()` in DAL logic to prevent historical data corruption.
- **Identity**: Auto-register users (upsert) on first interaction via `chat_id` (persistent identity).
- **Waitlist**: Proactively suggest waitlist via LLM when slots are empty to maximize retention.
- **Reminders**: Use 3-level notifications (24h, 6h, 1h) and reset them on reschedule.
- **Audit**: Log every DB mutation in `audit_logs` table with `actor_id` and `old/new_values`.
- **Infrastructure**: Use `dal-service` alias in Docker; never `localhost`.
- **Coding**: Use `isExecuted` guards in Code Nodes before accessing other nodes to prevent VM crashes.

## ❌ DON'T (Anti-patterns)
- **Hardcoding**: Prohibited to store API keys/PII in `.json`, `.md`, `.ts` or `.js`. Use `.env`.
- **Logic**: Don't allow cancellations for `CHECKED_IN`, `IN_PROGRESS`, or `COMPLETED` statuses.
- **Type Safety**: Don't send `chat_id` as string to DAL; ensure `BigInt` handling.
- **Sub-workflows**: Don't use `passthrough` in triggers; define explicit JSON schema for robustness.
- **SQL**: Avoid using session-level locks in PgBouncer (port 6543); use transaction-level locks (`_xact_`).

## 🛠️ TECHNICAL STACK SSOT
- **DAL Version**: 1.5.4 (Locks, Audit, Waitlist, Stats, Security Fixes).
- **QA Status**: 100% Success (18/18 tests passed).
- **AI Agent**: v2.5.0 (Waitlist Proactive, Identity Context).
