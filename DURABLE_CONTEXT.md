# BOOKING-TITANIUM DURABLE CONTEXT (2026-03-01)

## Infrastructure
- **Database:** Postgres 17 (Neon) - Schema v2 (Providers, Services, Schedules, Bookings, Users).
- **DAL Proxy:** Node.js/TypeScript running in Docker `booking_dal` container (Port 3000).
- **Network:** n8n communicates via `http://dal-service:3000`.

## Logic Status (TDD PASS)
- **Disponibilidad:** 7-day lookahead logic (Luxon UTC).
- **Reservas:** Atomic CREATE with collision protection.
- **Cancelación:** Full status sync (DB + GCal).
- **Reagendamiento:** Atomic CANCEL + CREATE flow.
- **Reminders:** NN_05 Cron (24h/2h before).

## Workflows (n8n)
- **NN_01 (Gateway):** Path `/booking-v1`. Red Team Score 1.0.
- **NN_03 (AI):** Groq Llama 3.3 70B with Agenda Context.
- **Integrations:** Google Calendar (id: mT5XZfEaeP1fqjl4), Gmail (id: T8fWDakSXbb5UsTL).

## Notes
- Webhook propagation latency observed in n8n production paths.
- DAL Proxy logs stored in `dal_server.log` inside project root.
