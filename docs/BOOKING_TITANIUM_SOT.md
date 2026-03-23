# BOOKING TITANIUM — ENGINEERING SOT (v1.0)
Optimized for LLM Context · Last Update: 2026-03-21

## 1. INFRAESTRUCTURA (DOCKER & NETWORK)
- **Queue Mode Integrity:** Main and Worker MUST run the exact same image version (use YAML anchors). Discrepancies break webhook schema registration.
- **Webhook Routing:** `WEBHOOK_URL` must NOT have a trailing slash. `N8N_HOST` must match public domain.
- **Security:** Ports 5678/5679 must bind to `127.0.0.1`. Access only via Cloudflare Tunnel.
- **YAML Discipline:** One environment variable per line. No concatenations.
- **Queue Mode Registration:** API activation updates DB but NOT the HTTP router. Manual "Publish" in UI is mandatory after API deployments.

## 2. POSTGRESQL (4-LAYER PATTERN)
- **Hard Rule:** Never use n8n Query Parameters UI (Bug #11835).
- **Layer 1 (Extract):** Code node pulls data into local vars.
- **Layer 2 (Validate):** Regex whitelist (UUID, INT, DATE, STR_SAFE) before query build.
- **Layer 3 (Build):** Build query string in Code node. Use explicit type casts (`::uuid`, `::int`, `::timestamptz`).
- **Layer 4 (Execute):** Postgres node uses `={{ $json.query }}`.
- **Atomicity:** Multiple writes must use `BEGIN; ... COMMIT;` in a single node. n8n does not share transactions across nodes.

## 3. GOOGLE CALENDAR (GCAL)
- **Persistence First:** Always write to local DB before GCal. Use DLQ for async retries on 4xx/5xx.
- **Safe Nodes:** Always set `onError: continueErrorOutput`.
- **RFC 3339:** Timestamps MUST include timezone suffix (`Z` or `+/-HH:MM`). Naive strings cause 400 Bad Request.
- **OAuth2:** GCP App in "Production" state to ensure permanent Refresh Tokens.

## 4. WORKFLOW ARCHITECTURE
- **Standard Contract:** All outputs must be `{ success: bool, error_code: string|null, error_message: string|null, data: object|null, _meta: object }`.
- **Validation Sandwich:** `[PRE-validate] -> [Operate] -> [POST-verify]`.
- **Execute Workflow Trigger:** Sub-workflows called via node MUST have an "Execute Workflow Trigger" (not just Webhook). Set `inputSource: passthrough`.
- **Parallel Processing:** In `mode: each`, use `alwaysOutputData: true` and `continueOnFail: true` to prevent a single item crash from killing the entire batch.
- **Aggregation:** For batch reports, use a node with `mode: runOnceForAllItems` and collect via `$input.all()`.

## 5. DEBUGGING & OPS
- **runData Access:** `EXECUTIONS_DATA_SAVE_ON_PROGRESS=true` is mandatory for sub-workflow visibility.
- **Integrated mode:** Sub-workflow executions don't always appear in main list; use execution ID from parent metadata.
- **Node Access:** Use optional chaining or `isExecuted` guards: `$('Node').isExecuted ? ... : null`.
- **Force-Push:** When API/UI sync fails, use direct `PUT /api/v1/workflows/{id}` removing read-only fields (`id`, `createdAt`).

## 6. PROHIBITIONS
- No Python in Production.
- No hardcoded credentials/PII in JSON/TS/MD.
- No `JSON.stringify` inside `{{ }}` expressions.
- No internal loopback HTTP requests (use Execute Workflow).
