# 🤖 WF2 v4.0 - PROMPT PARA AI LLM

**Propósito:** Instrucciones exactas para que una AI LLM (Claude, GPT-4, etc.) genere el workflow WF2 v4.0

**Ubicación:** Este archivo (`docs/WF2_V4_PROMPT_FOR_AI.md`)

---

## 📋 PROMPT PRINCIPAL (Copiar y Pegar en AI LLM)

```
Crea un workflow JSON de n8n llamado "WF2_Booking_Orchestrator_v4" con las siguientes especificaciones:

## CONTEXTO
Workflow de orquestación de reservas que debe ser compatible con queue mode de n8n v2.10.2+, evitando el bug conocido de runData null cuando se usan HTTP Request a sub-workflows.

## REQUERIMIENTOS TÉCNICOS

### Node Versions (OBLIGATORIO - GEMINI.md §3.7)
- Code: v2
- IF: v2.3
- Postgres: v2.6
- Google Calendar: v1.3
- Webhook: v2.1

### Arquitectura
- TODO INTERNO (sin HTTP Request a sub-workflows)
- Máximo 27 nodos
- Sin dependencias de otros workflows
- Compatible con queue mode

## FLUJO DEL WORKFLOW

### 1. Webhook Node
- Path: "booking-orchestrator-v4"
- HTTP Method: POST
- Response Mode: lastNode

### 2. Validate Input (Code v2)
JavaScript code que:
- Valida campos requeridos: provider_id, service_id, start_time
- Retorna Standard Contract si falta campo: {success: false, error_code: 'MISSING_FIELD', ...}
- Valida tipos: provider_id y service_id deben ser numéricos
- Retorna error si tipo inválido: {success: false, error_code: 'INVALID_TYPE', ...}
- Calcula end_time = start_time + duration_minutes (default 60)
- Genera idempotency_key determinístico: `booking_${provider_id}_${service_id}_${cleanTime}_${customer_id || chat_id || 'anon'}`
- Sanitiza idempotency_key (max 255 chars)
- Retorna contexto: {ctx: {provider_id, service_id, start_time, end_time, duration_minutes, user_id, customer_id, chat_id, event_title, idempotency_key, _meta}}

### 3. Check Idempotency (Postgres v2.6)
- Query: `SELECT id as booking_id, status, gcal_event_id FROM bookings WHERE idempotency_key = $1::text LIMIT 1;`
- Query Replacement: `={{ $json.ctx.idempotency_key }}`
- Always Output Data: true
- onError: continueErrorOutput

### 4. Process Idempotency (Code v2)
JavaScript que:
- Verifica si existe booking (items.length > 0 && items[0].json.booking_id)
- Si existe (duplicate): Retorna Standard Contract con is_duplicate: true
- Si no existe: Retorna {ctx, is_duplicate: false}

### 5. Is Duplicate? (IF v2.3)
- Condition: `={{ $json.is_duplicate }}` equals `true`
- True branch → Error Output node
- False branch → Build Lock Query node

### 6. Build Lock Query (Code v2)
JavaScript que construye:
- lock_key: `lock_${ctx.provider_id}_${ctx.start_time}`
- owner_token: ctx.idempotency_key
- lock_query: INSERT INTO booking_locks ... ON CONFLICT DO UPDATE ... RETURNING id

### 7. Acquire Lock (Postgres v2.6)
- Query: `={{ $json.lock_query }}`
- Always Output Data: true
- onError: continueErrorOutput

### 8. Process Lock (Code v2)
JavaScript que:
- Verifica lock_acquired: (items.length > 0 && items[0].json.id) ? true : false
- Si !lock_acquired: Retorna error LOCK_DENIED con _needs_lock_release: false
- Si lock_acquired: Retorna {ctx, lock_key, owner_token, lock_acquired: true}

### 9. Lock Acquired? (IF v2.3)
- Condition: `={{ $json.lock_acquired }}` equals `true`
- False → Error Output
- True → Build CB Query

### 10. Build CB Query (Code v2)
JavaScript que construye:
- cb_query: `SELECT allowed, failure_count FROM circuit_breaker WHERE service_id = 'google_calendar' LIMIT 1;`

### 11. Check Circuit Breaker (Postgres v2.6)
- Query: `={{ $json.cb_query }}`
- Always Output Data: true
- onError: continueErrorOutput

### 12. Process Circuit Breaker (Code v2)
JavaScript que:
- Verifica cb_allowed: cb_row && cb_row.allowed === true
- Si !cb_allowed: Retorna error CIRCUIT_BREAKER_OPEN con _needs_lock_release: true
- Si cb_allowed: Retorna {ctx, lock_key, owner_token, cb_allowed: true}

### 13. CB Allowed? (IF v2.3)
- Condition: `={{ $json.cb_allowed }}` equals `true`
- False → Error Output
- True → Build Avail Query

### 14. Build Avail Query (Code v2)
JavaScript que construye:
- avail_query: `SELECT COUNT(*) as count FROM bookings WHERE provider_id = ${ctx.provider_id} AND service_id = ${ctx.service_id} AND start_time = '${ctx.start_time}'::timestamptz AND status = 'CONFIRMED';`

### 15. Check Availability (Postgres v2.6)
- Query: `={{ $json.avail_query }}`
- Always Output Data: true
- onError: continueErrorOutput

### 16. Process Availability (Code v2)
JavaScript que:
- Verifica is_available: avail_count === 0
- Si !is_available: Retorna error NO_AVAILABILITY con _needs_lock_release: true
- Si is_available: Retorna {ctx, lock_key, owner_token, is_available: true}

### 17. Is Available? (IF v2.3)
- Condition: `={{ $json.is_available }}` equals `true`
- False → Error Output
- True → Create GCal Event

### 18. Create GCal Event (Google Calendar v1.3)
- Calendar: dev.n8n.stax@gmail.com
- Event start: `={{ $json.ctx.start_time }}`
- Event end: `={{ $json.ctx.end_time }}`
- Event summary: `={{ $json.ctx.event_title }}`
- Event description: `={{ Booking: ${$json.ctx.customer_id || $json.ctx.chat_id}\nProvider: ${$json.ctx.provider_id}\nService: ${$json.ctx.service_id} }}`
- onError: continueErrorOutput

### 19. Process GCal (Code v2)
JavaScript que:
- Verifica gcal_success: !!gcal_event_id
- Si !gcal_success: Retorna error GCAL_ERROR con _needs_lock_release: true
- Si gcal_success: Retorna {ctx, lock_key, owner_token, gcal_event_id, gcal_success: true}

### 20. GCal Success? (IF v2.3)
- Condition: `={{ $json.gcal_success }}` equals `true`
- False → Error Output
- True → Create Booking

### 21. Create Booking (Postgres v2.6)
- Query: `INSERT INTO bookings (provider_id, service_id, start_time, end_time, idempotency_key, gcal_event_id, user_id, status, created_at) VALUES ($1::int, $2::int, $3::timestamp, $4::timestamp, $5::text, $6::text, $7::bigint, 'CONFIRMED', NOW()) RETURNING id;`
- Query Replacement: `={{ [$json.ctx.provider_id, $json.ctx.service_id, $json.ctx.start_time, $json.ctx.end_time, $json.ctx.idempotency_key, $json.gcal_event_id, $json.ctx.user_id] }}`
- Always Output Data: true
- onError: continueErrorOutput

### 22. Process Booking (Code v2)
JavaScript que:
- Verifica booking_success: !!booking_id
- Si !booking_success: Retorna error DB_ERROR con needs_rollback: true, needs_lock_release: true
- Si booking_success: Retorna {ctx, lock_key, owner_token, gcal_event_id, booking_id, booking_success: true}

### 23. Booking Success? (IF v2.3)
- Condition: `={{ $json.booking_success }}` equals `true`
- False → Error Output
- True → Release Lock Success

### 24. Release Lock Success (Postgres v2.6)
- Query: `DELETE FROM booking_locks WHERE lock_key = $1::text;`
- Query Replacement: `={{ [$json.lock_key] }}`
- onError: continueErrorOutput

### 25. Success Output (Code v2)
JavaScript que retorna Standard Contract:
```json
{
  "success": true,
  "error_code": null,
  "error_message": null,
  "data": {
    "booking_id": <booking_id>,
    "idempotency_key": <idempotency_key>,
    "provider_id": <provider_id>,
    "service_id": <service_id>,
    "start_time": <start_time>,
    "end_time": <end_time>,
    "status": "CONFIRMED",
    "gcal_event_id": <gcal_event_id>,
    "is_duplicate": false
  },
  "_meta": {
    "source": "WF2_Booking_Orchestrator_v4",
    "timestamp": "<ISO timestamp>",
    "version": "4.0.0-internal"
  }
}
```

### 26. Error Output (Code v2)
JavaScript que:
- Formatea error response: {success: false, error_code, error_message, data, _meta}
- Si _needs_lock_release && lock_key: Agrega _release_lock: true, lock_key, owner_token
- Retorna error response

### 27. Release Lock Error (Postgres v2.6)
- Query: `DELETE FROM booking_locks WHERE lock_key = $1::text;`
- Query Replacement: `={{ [$json.lock_key] }}`
- onError: continueErrorOutput
- Sin output (final de error path)

## CONEXIONES ENTRE NODOS

```
Webhook → Validate Input → Check Idempotency → Process Idempotency → Is Duplicate?
Is Duplicate? (true) → Error Output → Release Lock Error → [FIN]
Is Duplicate? (false) → Build Lock Query → Acquire Lock → Process Lock → Lock Acquired?
Lock Acquired? (false) → Error Output → Release Lock Error → [FIN]
Lock Acquired? (true) → Build CB Query → Check Circuit Breaker → Process Circuit Breaker → CB Allowed?
CB Allowed? (false) → Error Output → Release Lock Error → [FIN]
CB Allowed? (true) → Build Avail Query → Check Availability → Process Availability → Is Available?
Is Available? (false) → Error Output → Release Lock Error → [FIN]
Is Available? (true) → Create GCal Event → Process GCal → GCal Success?
GCal Success? (false) → Error Output → Release Lock Error → [FIN]
GCal Success? (true) → Create Booking → Process Booking → Booking Success?
Booking Success? (false) → Error Output → Release Lock Error → [FIN]
Booking Success? (true) → Release Lock Success → Success Output → [FIN]
Error Output → Release Lock Error → [FIN]
```

## CREDENCIALES

### Postgres Account
- ID: SFNQsmuu4zirZAnP
- Host: ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech
- Database: neondb
- User: neondb_owner

### Google Calendar OAuth2
- ID: OsRBfz3Cs7Ph5uV5
- Email: dev.n8n.stax@gmail.com

## SETTINGS DEL WORKFLOW

```json
{
  "executionOrder": "v1",
  "saveDataErrorExecution": "all",
  "saveDataSuccessExecution": "all",
  "saveManualExecutions": true,
  "saveExecutionProgress": true
}
```

## TAGS

- production
- booking
- v4

## STANDARD CONTRACT OUTPUT

Todos los paths (success y error) deben retornar:

```json
{
  "success": <boolean>,
  "error_code": <null|string>,
  "error_message": <null|string>,
  "data": <object|null>,
  "_meta": {
    "source": "WF2_Booking_Orchestrator_v4",
    "timestamp": "<ISO timestamp>",
    "version": "4.0.0-internal"
  }
}
```

## VALIDACIONES

Antes de entregar el JSON, verificar:
- [ ] 27 nodos exactos
- [ ] Todas las node versions correctas
- [ ] Todas las conexiones especificadas
- [ ] Todos los Code nodes con JavaScript válido
- [ ] Todos los Postgres nodes con query y queryReplacement
- [ ] Todos los IF nodes con conditions en formato v2.3
- [ ] Credenciales referenciadas correctamente
- [ ] Standard Contract en todos los outputs
- [ ] Error paths con Release Lock
- [ ] Sin HTTP Request nodes (todo interno)
- [ ] Sin Execute Workflow nodes (sin sub-workflows)

## FORMATO DE SALIDA

Entregar JSON completo de n8n workflow, listo para importar vía UI.
```

---

## 🎯 PROMPTS ADICIONALES (Iteración)

### Prompt para Debuggear

```
El workflow generado tiene el siguiente error: <describir error>

Verificar:
1. Conexiones entre nodos
2. JavaScript en Code nodes
3. Queries en Postgres nodes
4. Conditions en IF nodes
5. Credenciales referenciadas

Corregir y entregar JSON actualizado.
```

### Prompt para Optimizar

```
Optimizar el workflow para:
1. Reducir nodos Code duplicados
2. Consolidar queries similares
3. Mejorar manejo de errores
4. Agregar logging

Mantener compatibilidad con queue mode y node versions.
```

### Prompt para Agregar Feature

```
Agregar al workflow:
1. Nuevo nodo de validación adicional
2. Circuito de retry para GCal
3. DLQ integration para fallos

Mantener Standard Contract y node versions.
```

---

## 📚 ARCHIVOS DE REFERENCIA

| Archivo | Propósito |
|---------|-----------|
| `docs/WF2_V4_DISENO.md` | Diseño completo del workflow |
| `docs/WF2_V4_IMPORT_GUIDE.md` | Guía de importación paso a paso |
| `docs/WF2_V4_INVESTIGACION_N8N.md` | Bugs conocidos y condiciones bloqueantes |
| `docs/HERRAMIENTAS_AI_PARA_N8N.md` | Herramientas AI para crear workflows |
| `workflows/seed_clean/WF2_Booking_Orchestrator_v4_FINAL.json` | JSON final generado |

---

## ✅ EJEMPLO DE USO CON AI LLM

### 1. Claude AI (claude.ai)

```
[Pegar PROMPT PRINCIPAL completo]

Generar JSON completo de n8n workflow.
```

### 2. ChatGPT-4 (chat.openai.com)

```
[Pegar PROMPT PRINCIPAL completo]

Crear archivo JSON descargable.
```

### 3. Cursor IDE (con MCP)

```
[Pegar PROMPT PRINCIPAL completo]

Usar MCP n8n-workflow-builder para crear directamente en n8n.
```

### 4. Qwen Code (este asistente)

```
[Pegar PROMPT PRINCIPAL completo]

Generar JSON y guardar en workflows/seed_clean/
```

---

## 🎯 RESULTADO ESPERADO

AI LLM debería generar:
- ✅ JSON válido de n8n workflow
- ✅ 27 nodos exactos
- ✅ Node versions correctas
- ✅ Conexiones completas
- ✅ Standard Contract en outputs
- ✅ Listo para importar en n8n UI

---

**Estado:** ✅ LISTO PARA USAR  
**Versión:** 1.0  
**Última actualización:** 2026-03-17
