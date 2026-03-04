# PLAN UNIFICADO — BOOKING TITANIUM
Fecha: 2026-03-03 | Fuentes: auditoriaGEMINI.md · auditoriaKIMI.md · auditoriaQWEN.md

---

## LEYENDA
- [ ] = pendiente | [P] = puede ejecutarse en paralelo con otros [P] del mismo bloque
- SRC: referencia a auditoría fuente (G=GEMINI, K=KIMI, Q=QWEN)

---

## BLOQUE 1 — RECTIFICACIÓN DE ESQUEMAS / TEMPLATES / ARQUITECTURA

> Correcciones a nivel de definición antes de tocar lógica.

- [ ] [P] **B1-01** Definir template base Standard Contract: `{success, error_code, error_message, data, _meta}` con null explícitos. SRC: K#2 K#3 K#12 Q#9
- [ ] [P] **B1-02** Definir template Triple Entry Pattern: Manual Trigger + Webhook + Execute Workflow Trigger. SRC: K#4 Q#OBLIGATORIO_01
- [ ] [P] **B1-03** Definir template Validation Sandwich: nodo PRE-Validate → IF → Operation → nodo POST. SRC: K#7 K#8 K#9 G-Fase2
- [ ] [P] **B1-04** Definir template HTTP Request con Watchdog: timeout configurado + retry con backoff exponencial. SRC: K#5 Q#3 G-Fase4
- [ ] [P] **B1-05** Establecer convención de naming de nodos internos (ej: `BB_XX` / `NN_XX`). SRC: K#17 Q-Scripts
- [ ] [P] **B1-06** Crear `docker-compose.yml` con: Redis broker, contenedor `n8n-main` (`EXECUTIONS_MODE=queue`), contenedor `n8n-worker`, PostgreSQL con `EXECUTIONS_DATA_PRUNE=true`. SRC: G-Fase1 K-Fase1 Q#1

---

## BLOQUE 2 — REPARACIÓN (orden por criticidad)

### 2A — Crítico (bloqueante para producción)

- [ ] [P] **B2-01** `NN_00_Global_Error_Handler.json:120` — Reemplazar `$env.N8N_EDITOR_BASE_URL` por `$vars` o nodo Set previo. SRC: K#1 Q#7
- [ ] [P] **B2-02** `DB_Get_Availability.json:61` — Fix syntax error en `jsCode` + agregar `error_code` y `error_message` null explícitos. SRC: K#3
- [ ] [P] **B2-03** `DB_Create_Booking.json` — Agregar Standard Contract completo al output. SRC: K#2 Q#9
- [ ] [P] **B2-04** `DB_Find_Next_Available.json` — Agregar Triple Entry Pattern + Standard Contract. SRC: K#4
- [ ] [P] **B2-05** `GMAIL_Send_Confirmation.json` — Agregar Triple Entry Pattern + Standard Contract. SRC: K#4 Q#9
- [ ] [P] **B2-06** `GCAL_Create_Event.json` — Agregar Triple Entry Pattern + `error_code`/`error_message` null al Standard Contract. SRC: K#4 K#12
- [ ] [P] **B2-07** `GCAL_Delete_Event.json` — Agregar Triple Entry Pattern + Standard Contract + manejo de errores. SRC: K#4 Q#9

### 2B — Mayor

- [ ] [P] **B2-08** `NN_01_Booking_Gateway.json:18` — Cambiar path `nn-01-booking-gateway-test` a ruta de producción `/webhook/`. SRC: K#6
- [ ] [P] **B2-09** `DB_Create_Booking.json` — Implementar Validation Sandwich (PRE + POST). SRC: K#7
- [ ] [P] **B2-10** `DB_Get_Availability.json` — Implementar Validation Sandwich (PRE + POST). SRC: K#8
- [ ] [P] **B2-11** `DB_Reschedule_Booking.json` — Agregar validación PRE de `booking_id` (UUID) + validación POST de sub-workflows. SRC: K#9
- [ ] [P] **B2-12** `NN_00_Global_Error_Handler.json:72` — Reemplazar interpolación directa SQL por VRF/parámetros. SRC: K#10
- [ ] [P] **B2-13** `NN_02_Message_Parser.json:35` — Extender sanitización: agregar escape de backslashes (no solo comillas). SRC: K#11
- [ ] [P] **B2-14** `GCAL_Create_Event.json:100-101` — Agregar `error_code: null` y `error_message: null` explícitos. SRC: K#12
- [ ] [P] **B2-15** `DB_Reschedule_Booking.json:86` — Remover email hardcodeado, usar variable. SRC: K#19
- [ ] [P] **B2-16** `DB_Create_Booking.json:36` — Remover valores por defecto hardcodeados. SRC: K#18
- [ ] [P] **B2-17** `NN_02_Message_Parser.json` — Agregar nodo de salida con Standard Contract. SRC: Q#8

### 2C — Menor

- [ ] [P] **B2-18** `NN_05_Reminder_Cron.json` — Corregir naming de nodos internos a convención definida en B1-05. SRC: K#17
- [ ] [P] **B2-19** Renombrar `n8n-crud-agent.ts` → `n8n_crud_agent.ts` (consistencia con GEMINI.md Sección 6). SRC: Q#5

---

## BLOQUE 3 — TESTING

- [ ] [P] **B3-01** Crear `verify_workflow_sync.ts` — verifica sincronización de workflows contra `workflow_activation_order.json`. SRC: Q-Scripts K-Recomendaciones
- [ ] [P] **B3-02** Crear `add_manual_triggers.ts` — agrega Manual Trigger a workflows que solo tienen Execute Workflow Trigger. SRC: Q-Scripts
- [ ] [P] **B3-03** Crear `execute_all_workflows.ts` — smoke test de activación de todos los workflows. SRC: Q-Scripts
- [ ] **B3-04** (requiere B2-01→B2-07 completos) Ejecutar `workflow_validator.ts --fix --verbose workflows/` sobre todos los JSON. SRC: K-Recomendaciones
- [ ] **B3-05** (requiere B3-04) Crear archivos `.test.ts` mínimos para: `NN_01`, `NN_03`, `NN_04`. SRC: Q#6
- [ ] **B3-06** (requiere B3-05) Extender tests a: `DB_Create_Booking`, `DB_Get_Availability`, `GCAL_Create_Event`, `GMAIL_Send_Confirmation`.
- [ ] **B3-07** (requiere B1-06) Validar empíricamente latencia de webhooks en modo Queue. SRC: G-Fase1

---

## BLOQUE 4 — ESCALAMIENTO

### 4A — Infraestructura (requiere B1-06)

- [ ] **B4-01** Levantar stack con `docker-compose.yml` de B1-06 y verificar worker activo.
- [ ] **B4-02** Configurar Redis como caché delante de `DB_Get_Availability.json` (nodo `n8n-nodes-base.redis`). SRC: G-Fase4 K-Fase4 Q#4

### 4B — Inteligencia MCP (requiere B4-01)

- [ ] [P] **B4-03** Verificar `N8N_MCP_ENABLED=true` en docker-compose y exponer servidor MCP nativo. SRC: G-Fase2 K-Fase2
- [ ] [P] **B4-04** Convertir workflows `DB_*.json` en MCP Tools. SRC: G-Fase2 K-Fase2 Q#2
- [ ] [P] **B4-05** Convertir workflows `GCAL_*.json` en MCP Tools. SRC: G-Fase2 K-Fase2
- [ ] **B4-06** (requiere B4-03→B4-05) Refactorizar `NN_03_AI_Agent.json`: conectar nodos MCP Tools al agente Langchain. SRC: G-Fase2 K-Fase2 Q#2

### 4C — Resiliencia (puede ejecutarse en paralelo con 4B)

- [ ] [P] **B4-07** Aplicar template Watchdog de B1-04 a todos los nodos HTTP Request en: `DB_Create_Booking`, `DB_Get_Availability`, `GCAL_Create_Event`, `GMAIL_Send_Confirmation`. SRC: K#5 Q#3
- [ ] [P] **B4-08** Implementar Rate Limiting en `NN_01_Booking_Gateway.json`. SRC: G-Fase4 K-Fase4
- [ ] [P] **B4-09** Implementar Circuit Breakers para GCAL y Gmail (detección de fallos + fallback). SRC: G-Fase4 K-Fase4

---

## BLOQUE 5 — PENDIENTES / ROADMAP FUTURO

- [ ] **B5-01** Crear `NN_04_Omnichannel_Router.json`. SRC: G-Fase3 K-Fase3 Q#10
- [ ] **B5-02** Crear `NN_04_WhatsApp_Sender.json`. SRC: G-Fase3 K-Fase3
- [ ] **B5-03** Normalizar payloads en `NN_01_Booking_Gateway.json` para soportar canales adicionales. SRC: G-Fase3
- [ ] **B5-04** Actualizar `NN_00_Global_Error_Handler.json` para notificaciones multicanal. SRC: K-Fase3
- [ ] **B5-05** Actualizar `README.md` con scripts TypeScript nuevos y cambios de arquitectura. SRC: K#14

---

## SCORE DE PARTIDA (consenso de auditorías)

| Auditoría | Score Global |
|-----------|-------------|
| KIMI      | ~65%        |
| QWEN      | ~61%        |
| GEMINI    | ~60% (est.) |
| **Consenso** | **~62%** |

---
_Plan generado: 2026-03-03_
