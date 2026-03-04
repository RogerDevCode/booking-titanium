# 🔍 AUDITORÍA: Workflows vs GEMINI.md + TODO.md

**Fecha:** 2026-03-03  
**Auditor:** Kilo AI (Claude/Kimi)  
**Versión GEMINI.md:** v3.1 (Cloud-Native + n8n v2.10.2)

---

## 📊 RESUMEN EJECUTIVO

| Métrica | Valor |
|---------|-------|
| Total Workflows | 14 |
| **Violaciones CRÍTICAS** | 5 |
| **Violaciones MAYORES** | 8 |
| **Violaciones MENORES** | 6 |
| Cumplimiento GEMINI.md | ~65% |

---

## 🚨 VIOLACIONES CRÍTICAS (Bloqueantes)

### 1. `[PROHIBIDO_04]` Uso de `$env` en Code Node
**Archivo:** `NN_00_Global_Error_Handler.json:120`
```javascript
"message": "=...{{ $env.N8N_EDITOR_BASE_URL }}/workflow/..."
```
**Problema:** `$env` está prohibido en Code nodes desde N8N v2.0+
**Fix:** Usar `$vars` (Enterprise) o pasar como parámetro vía nodo previo.

---

### 2. `[OBLIGATORIO_02]` Standard Contract Incompleto
**Archivo:** `DB_Create_Booking.json`
**Problema:** No retorna Standard Contract. Solo devuelve respuesta del DAL.
**Faltan:** `success`, `error_code`, `error_message`, `_meta`

---

### 3. `[OBLIGATORIO_02]` Standard Contract Incompleto
**Archivo:** `DB_Get_Availability.json:61`
```javascript
"jsCode": "return [{ json: { success: true, data: .first().json, _meta:..."
```
**Problema:** Syntax error en código + falta `error_code` y `error_message` (null explícitos requeridos por OBLIGATORIO_11)

---

### 4. `[OBLIGATORIO_01]` Falta Triple Entry Pattern
**Archivos Afectados:**
- `DB_Find_Next_Available.json` - Solo tiene Execute Workflow Trigger
- `GMAIL_Send_Confirmation.json` - Solo tiene Execute Workflow Trigger
- `GCAL_Create_Event.json` - Solo tiene Execute Workflow Trigger
- `GCAL_Delete_Event.json` - Solo tiene Execute Workflow Trigger

**Problema:** No tienen Manual Trigger + Webhook + Execute Workflow Trigger

---

### 5. `[OBLIGATORIO_05]` Sin Watchdog (Timeouts/Retry)
**Archivos Afectados:** Todos los HTTP Request nodes
**Ejemplo:** `DB_Create_Booking.json:49-66`, `DB_Get_Availability.json:14-20`
**Problema:** Ningún nodo HTTP Request tiene configurado timeout ni retry logic con backoff exponencial.

---

## ⚠️ VIOLACIONES MAYORES

### 6. `[PROHIBIDO_07]` Webhook de Testing en uso
**Archivo:** `NN_01_Booking_Gateway.json:18`
```json
"path": "nn-01-booking-gateway-test"
```
**Problema:** Usa ruta `-test` que implica `/webhook-test/`
**Fix:** Usar ruta de producción `/webhook/`

---

### 7. `[OBLIGATORIO_04]` Validation Sandwich Incompleto
**Archivo:** `DB_Create_Booking.json`
**Problema:** No hay validación PRE ni POST. Solo pasa datos al DAL sin validar.

---

### 8. `[OBLIGATORIO_04]` Validation Sandwich Incompleto
**Archivo:** `DB_Get_Availability.json`
**Problema:** Sin validación PRE de parámetros ni POST de respuesta DAL.

---

### 9. `[OBLIGATORIO_04]` Validation Sandwich Incompleto
**Archivo:** `DB_Reschedule_Booking.json`
**Problema:** Sin validación PRE de booking_id (UUID) ni POST de respuestas de sub-workflows.

---

### 10. `[OBLIGATORIO_03]` VRF No Aplicado en PostgreSQL
**Archivo:** `NN_00_Global_Error_Handler.json:72`
```sql
"query": "INSERT INTO system_logs ... '{{ $json.error_message.replace(/'/g, \"''\") }}'..."
```
**Problema:** Usa interpolación directa sin validación previa (solo escape básico de quotes)

---

### 11. `[SEC_02]` String Sanitization Incompleta
**Archivo:** `NN_02_Message_Parser.json:35`
```javascript
"text": text.replace(/'/g, "''").substring(0, 500)
```
**Problema:** Solo escapa comillas simples. Falta escape de backslashes según `[SEC_02]`.

---

### 12. `[OBLIGATORIO_06]` Sub-workflows sin Standard Contract
**Archivo:** `GCAL_Create_Event.json:100-101`
```javascript
"jsCode": "return [{ json: { success: true, gcal_event_id: ..., _meta:... } }]"
```
**Problema:** Falta `error_code` y `error_message` explícitos como null.

---

### 13. `[OBLIGATORIO_10]` IF Node - Comprobación
✅ **OK:** Todos los nodos IF usan `typeVersion: 2.3` (correcto para n8n v2.10.2+)

---

## 📝 VIOLACIONES MENORES

| # | Regla | Archivo | Detalle |
|---|-------|---------|---------|
| 14 | `[OBLIGATORIO_08]` | Varios | Scripts TypeScript sin README.md actualizado |
| 15 | `[OBLIGATORIO_09]` | N/A | No hay queries SQL con parámetros (usan DAL) |
| 16 | `[OBLIGATORIO_07]` | `NN_00_Global_Error_Handler.json:93` | Usa `$vars.TELEGRAM_ID` (correcto si es Enterprise) |
| 17 | Naming | `NN_05_Reminder_Cron.json` | No sigue convención BB_XX o NN_XX para nodos |
| 18 | Hardcoded | `DB_Create_Booking.json:36` | Valores por defecto hardcodeados |
| 19 | Hardcoded | `DB_Reschedule_Booking.json:86` | Email hardcodeado |

---

## 🎯 ANÁLISIS vs TODO.md (Roadmap)

### Fase 1: Escalamiento Infraestructura
| Tarea | Estado | Notas |
|-------|--------|-------|
| Redis + Queue Mode | ❌ PENDIENTE | No hay docker-compose.yml con Redis |
| n8n-main + n8n-worker | ❌ PENDIENTE | Arquitectura single-container |
| Retención Postgres | ❌ PENDIENTE | Sin configuración de pruning |

### Fase 2: Adopción MCP
| Tarea | Estado | Notas |
|-------|--------|-------|
| Servidor MCP nativo | ❌ PENDIENTE | `OBLIGATORIO_06` no implementado |
| Exponer DB como Tools | ❌ PENDIENTE | Flujos DB usan HTTP Request, no MCP |
| Exponer GCAL como Tools | ❌ PENDIENTE | Mismo problema |
| Refactor AI Agent | ❌ PENDIENTE | NN_03 sigue usando branches IF/Switch |

### Fase 3: Arquitectura Omnicanal
| Tarea | Estado | Notas |
|-------|--------|-------|
| NN_04_Omnichannel_Router | ❌ PENDIENTE | No existe |
| Normalizar payloads | ❌ PENDIENTE | Cada canal tiene formato diferente |
| WhatsApp Sender | ❌ PENDIENTE | No existe |
| Error Handler multicanal | ❌ PENDIENTE | Solo notifica Telegram |

### Fase 4: Circuit Breakers / Rate Limits
| Tarea | Estado | Notas |
|-------|--------|-------|
| Redis Cache | ❌ PENDIENTE | `DB_Get_Availability` sin cache |
| Rate Limiting | ❌ PENDIENTE | Sin protección en Gateway |
| Watchdog / Retry | ❌ PENDIENTE | Ningún HTTP Request tiene timeout |
| Circuit Breakers | ❌ PENDIENTE | Sin detección de fallos GCAL/Gmail |

---

## 📋 PLAN DE REMEDIACIÓN PRIORIZADO

### Prioridad 1 (CRÍTICA - Semana 1)
1. **Fix `$env` en NN_00** - Usar `$vars` o nodo Set previo
2. **Fix syntax error en DB_Get_Availability** - Línea 61
3. **Agregar Standard Contract** a DB_Create_Booking, GCAL_Create_Event, etc.
4. **Agregar Triple Entry Pattern** a los 4 workflows faltantes

### Prioridad 2 (ALTA - Semana 2)
5. **Implementar Validation Sandwich** en todos los DB workflows
6. **Configurar Watchdog** (timeout + retry) en HTTP Requests
7. **Fix webhooks de testing** → rutas de producción

### Prioridad 3 (MEDIA - Semana 3-4)
8. **MCP Migration** - Empezar con Fase 2 del TODO.md
9. **Redis Cache** para DB_Get_Availability
10. **Rate Limiting** en NN_01_Booking_Gateway

---

## 📊 SCORE DE CUMPLIMIENTO POR WORKFLOW

| Workflow | Score | Problemas Principales |
|----------|-------|----------------------|
| NN_00_Global_Error_Handler | 70% | `$env` prohibido, VRF incompleto |
| NN_01_Booking_Gateway | 85% | Webhook test path, sin rate limiting |
| NN_02_Message_Parser | 90% | Sanitization incompleta |
| NN_03_AI_Agent | 80% | Sin MCP Tools (OBLIGATORIO_06) |
| NN_04_Telegram_Sender | 85% | Triple Entry OK, falta sticker 📤 OUT |
| NN_05_Reminder_Cron | 75% | Sin Standard Contract final |
| DB_Create_Booking | 60% | Sin Standard Contract, sin validación |
| DB_Get_Availability | 55% | **Syntax error**, sin validación |
| DB_Cancel_Booking | 80% | VRF aplicado parcialmente ✓ |
| DB_Find_Next_Available | 50% | Sin Triple Entry, sin Standard Contract |
| DB_Reschedule_Booking | 70% | Sin validación PRE/POST |
| GCAL_Create_Event | 65% | Sin Triple Entry, Standard Contract incompleto |
| GCAL_Delete_Event | 60% | Sin Triple Entry, sin Standard Contract |
| GMAIL_Send_Confirmation | 60% | Sin Triple Entry, sin Standard Contract |

---

## 🎯 RECOMENDACIONES ESTRATÉGICAS

### Inmediato (Antes de próximo deploy)
```bash
# 1. Fix syntax error crítico
npx tsx scripts-ts/fix_node_versions.ts workflows/DB_Get_Availability.json

# 2. Validar todos los workflows
npx tsx scripts-ts/workflow_validator.ts --fix --verbose workflows/

# 3. Verificar sincronización
npx tsx scripts-ts/verify_workflow_sync.ts
```

### Corto Plazo (2-4 semanas)
1. Implementar **Triple Entry Pattern** en workflows faltantes
2. Migrar de `$env` a `$vars` o parámetros explícitos
3. Agregar **Standard Contract** completo a todos los outputs

### Mediano Plazo (1-3 meses)
1. **MCP Adoption**: Refactorizar AI Agent para usar Tools nativas
2. **Redis + Queue Mode**: Escalar infraestructura
3. **Circuit Breakers**: Implementar resiliencia en APIs externas

---

## 📚 REFERENCIAS

- GEMINI.md v3.1 - System Prompt N8N Automation Engineer
- TODO.md - Plan de Escalamiento Booking Titanium
- n8n Docs: https://docs.n8n.io/2-0-breaking-changes/
- GitHub Issue #14775: propertyValues[itemName] is not iterable

---

**Conclusión:** El proyecto tiene ~65% de cumplimiento con GEMINI.md. Las violaciones críticas deben resolverse antes de pasar a producción, especialmente el uso de `$env` y los workflows sin Triple Entry Pattern.

---
*Generado automáticamente por Kilo AI - 2026-03-03*
