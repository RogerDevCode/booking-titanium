# DB_Create_Booking v4.1 — CERTIFIED

**Workflow ID:** `0pqnF4CQSGJMp7br`  
**Estado:** ✅ **CERTIFIED FOR PRODUCTION**  
**Última actualización:** 2026-03-22

---

## 1. RESUMEN

DB_Create_Booking es el servicio de creación de bookings con idempotencia nativa. Implementa el **Standard Contract** de Titanium y sigue el patrón **Zero-Throw**.

### Características Clave

- ✅ **Idempotencia:** `idempotency_key` único previene duplicados
- ✅ **Validación exhaustiva:** Todos los campos validados antes de DB
- ✅ **Zero-Throw:** Errores retornan objetos, no excepciones
- ✅ **Standard Contract:** Salida consistente en todos los paths
- ✅ **Gate + Skip Pattern:** Routing sin IF nodes (evita bug n8n v2.3)

---

## 2. ARQUITECTURA

```
Validate Input → Build Idempotency Check Query → Check Idempotency
                                                        ↓
                        ┌───────────────────────────────┴────────────────────┐
                        ↓                                                    ↓
              Route By Idempotency                            Handle Idempotency Error
                        ↓                                                    ↓
            ┌───────────┴───────────┐                                        │
            ↓                       ↓                                        │
    Build Insert Query      Pass Through Error ──────────────────────────────┤
            ↓                       ↓                                        │
    Execute Insert          Format Response ←────────────────────────────────┤
            ↓
    ┌───────┴───────┐
    ↓               ↓
Format Success   Handle Insert Error
    ↓               ↓
    └───────┬───────┘
            ↓
    Format Response (única salida)
```

---

## 3. NODOS CLAVE

### 3.1. Validate Input
- **Función:** Validación exhaustiva de todos los campos
- **Pattern:** Zero-Throw (retorna error objects, no throw)
- **Campos validados:**
  - `idempotency_key` (required, unique, ≤255 chars)
  - `provider_id` (positive integer)
  - `service_id` (positive integer)
  - `start_time` (ISO 8601 con timezone)
  - `end_time` (optional, debe ser > start_time)
  - `chat_id` (optional, non-negative integer)
  - `gcal_event_id` (optional, ≤255 chars)
  - `status` (optional, enum: CONFIRMED, CANCELLED, RESCHEDULED, COMPLETED, NO_SHOW)

### 3.2. Route By Idempotency
- **Función:** Decide el flujo según resultado de idempotencia
- **Pattern:** Gate + Skip (reemplaza IF node roto)
- **Paths:**
  - `_route: 'error'` → Validación falló → Pass Through Error
  - `_route: 'existing'` → Booking existe → Format Response (is_duplicate: true)
  - `_route: 'new'` → Booking nuevo → Build Insert Query

### 3.3. Pass Through Error
- **Función:** Converger errores de validación a Format Response
- **Pattern:** Gate (retorna `[]` para items `_route: 'new'`)

### 3.4. Format Response
- **Función:** Unificar TODAS las salidas en Standard Contract
- **Pattern:** Unified Output (single exit point)

---

## 4. STANDARD CONTRACT

### Success Response
```json
{
  "success": true,
  "error_code": null,
  "error_message": null,
  "data": {
    "booking_id": "uuid",
    "status": "CONFIRMED",
    "is_duplicate": false
  },
  "_meta": {
    "source": "DB_Create_Booking",
    "timestamp": "2026-03-22T21:46:35.873Z",
    "workflow_id": "0pqnF4CQSGJMp7br"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error_code": "INVALID_TYPE",
  "error_message": "provider_id must be a positive integer",
  "data": null,
  "_meta": {
    "source": "DB_Create_Booking",
    "timestamp": "2026-03-22T21:46:35.873Z",
    "workflow_id": "0pqnF4CQSGJMp7br"
  }
}
```

### Idempotent Response
```json
{
  "success": true,
  "error_code": null,
  "error_message": null,
  "data": {
    "booking_id": "uuid",
    "status": "CONFIRMED",
    "is_duplicate": true
  },
  "_meta": {...}
}
```

---

## 5. ERROR CODES

| Error Code | Descripción | HTTP Status |
|------------|-------------|-------------|
| `MISSING_FIELD` | Campo requerido faltante | 400 |
| `INVALID_TYPE` | Tipo de dato inválido | 400 |
| `INVALID_INPUT` | Input fuera de rango/formato | 400 |
| `INVALID_DATE` | Fecha inválida (ej: Feb 30) | 400 |
| `INVALID_RANGE` | Rango inválido (end < start) | 400 |
| `FK_VIOLATION` | Foreign key violation | 400 |
| `DUPLICATE_IDEMPOTENCY_KEY` | Race condition detectado | 409 |
| `DB_CONNECTION_ERROR` | DB unreachable | 503 |
| `DB_TIMEOUT` | DB query timeout | 504 |
| `DB_AUTH_ERROR` | DB authentication failed | 500 |
| `PIPELINE_ERROR` | Internal pipeline error | 500 |

---

## 6. TESTS

### Test 1: Happy Path
```bash
curl -X POST https://n8n.stax.ink/webhook/db-create-booking \
  -H "Content-Type: application/json" \
  -d '{"provider_id":1,"service_id":1,"start_time":"2026-04-25T10:00:00-03:00","idempotency_key":"TEST-001"}'
```

**Resultado esperado:**
```json
{"success": true, "booking_id": "uuid", "is_duplicate": false}
```

### Test 2: Idempotencia
```bash
curl -X POST https://n8n.stax.ink/webhook/db-create-booking \
  -H "Content-Type: application/json" \
  -d '{"provider_id":1,"service_id":1,"start_time":"2026-04-25T10:00:00-03:00","idempotency_key":"TEST-001"}'
```

**Resultado esperado:**
```json
{"success": true, "booking_id": "uuid", "is_duplicate": true}
```

### Test 3: Error de Validación
```bash
curl -X POST https://n8n.stax.ink/webhook/db-create-booking \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"abc"}'
```

**Resultado esperado:**
```json
{"success": false, "error_code": "INVALID_TYPE", "error_message": "provider_id must be a positive integer"}
```

---

## 7. FIXES APLICADOS

### v4.1 — Gate + Skip Pattern (2026-03-22)

**Problema:** IF node v2.3 rutea incorrectamente condiciones booleanas

**Solución:** 
- Eliminado IF node `Has Existing Booking?`
- Agregado `Route By Idempotency` con campo `_route`
- Agregado `Pass Through Error` para converger paths
- `Format Response` unifica todas las salidas

**Nodos:** 14 (vs 15 en v3.0)

### v4.0 — Zero-Throw Pattern (2026-03-21)

**Problema:** Validación con `throw` rompía el flujo

**Solución:**
- Todos los nodos retornan error objects
- Validación no bloqueante con `_exit_early` flag
- Query inofensiva para errores (`SELECT NULL WHERE FALSE`)

---

## 8. SSOT (Single Source of Truth)

**Único archivo válido:** `workflows/DB_Create_Booking.json`

Cualquier otro archivo (`*_fixed.json`, `*_current.json`, `*.backup`, `*.broken`) es **OBSOLETO** y debe ser eliminado.

---

## 9. REFERENCIAS

- **GEMINI.md:** Reglas de arquitectura del proyecto
- **QWEN.md:** Contexto de implementación
- **workflow_activation_order.json:** Orden de activación de workflows

---

**Última verificación:** 2026-03-22  
**Todos los tests:** ✅ PASSED  
**Estado:** ✅ **CERTIFIED FOR PRODUCTION**
