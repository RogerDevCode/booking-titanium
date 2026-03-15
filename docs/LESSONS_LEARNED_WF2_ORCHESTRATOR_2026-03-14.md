# Lessons Learned - WF2 Booking Orchestrator v2.0.0

**Fecha:** 2026-03-14  
**Workflow:** WF2_Booking_Orchestrator  
**Workflow ID:** `ZgiDJcBT61v43NvN`  
**Estado:** En desarrollo - Debugging activo

---

## 📋 Resumen Ejecutivo

Durante el desarrollo y debugging del WF2 Booking Orchestrator v2.0.0, se identificaron patrones críticos, errores comunes y mejores prácticas que deben ser consideradas en futuros desarrollos de workflows distribuidos en n8n.

---

## 🔥 Problemas Críticos Encontrados

### 1. Error "Rollback requires at least one valid ID"

**Síntoma:**
```json
{
  "errorMessage": "Rollback requires at least one valid ID (gcal, booking uuid or lock) [line 22]",
  "errorDetails": {},
  "n8nDetails": {
    "n8nVersion": "2.10.2 (Self Hosted)",
    "stackTrace": ["Error: Rollback requires at least one valid ID..."]
  }
}
```

**Causa Raíz:**
- El Error Handler de WF2 llamaba a WF6 Rollback **sin verificar** si había IDs válidos para hacer rollback
- Cuando el error ocurría temprano en el flujo (antes de obtener lock o crear GCal), todos los campos (`booking_id`, `gcal_event_id`, `lock_id`, `lock_key`) eran `null`
- WF6 requiere **al menos un ID válido** para ejecutar

**Solución:**
```javascript
// En WF2 Error Handler - Nodo "Build Rollback Payload"
const hasValidId = !!(rollback.booking_id || rollback.gcal_event_id || rollback.lock_id || rollback.lock_key);

return [{
  json: {
    ...rollback,
    has_valid_id: hasValidId,
    _meta: { ... }
  }
}];
```

Luego agregar nodo IF "Has Rollback Data?" que:
- **TRUE** → Trigger WF6 Rollback
- **FALSE** → Skip Rollback - No IDs (log solo)

**Lección:** ✅ **Nunca llamar a rollback sin verificar que hay algo que hacer rollback**

---

### 2. Webhook Devuelve "Error in workflow" Sin resultData

**Síntoma:**
```json
{
  "message": "Error in workflow"
}
```

**Ejecución muestra:**
```json
{
  "status": "error",
  "resultData": null  // ← Error ocurrió antes de iniciar ejecución
}
```

**Causas Probables (en orden de probabilidad):**

1. **Credenciales inválidas** - Nodo Postgres usa credencial que no existe o expiró
2. **Webhook path duplicado** - Otro workflow usando mismo path
3. **Nodo Code con sintaxis inválida** - JSON.stringify en expresiones `{{ }}`
4. **Nodo HTTP Request mal configurado** - URL o body incorrectos

**Debugging Steps (Orden Correcto):**

```bash
# 1. Probar webhook minimal (solo Code node)
curl -X POST https://n8n.stax.ink/webhook/booking-orchestrator \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# 2. Obtener última ejecución
cd scripts-ts && npx tsx get_wf2_last_exec.ts

# 3. Verificar workflow activo
npx tsx n8n_crud_agent.ts --get <workflow-id>

# 4. Verificar credenciales (si es posible)
# 5. Revisar nodos uno por uno
```

**Lección:** ✅ **Cuando resultData es null, el error es de configuración, no de lógica**

---

### 3. JSON.stringify en Expresiones n8n v2.x

**Problema:**
```javascript
// ❌ ESTO FALLA en n8n v2.10.2+
"jsonBody": "={{ JSON.stringify({ gcal_event_id: $json._gcal_id }) }}"
```

**Error:**
```
SyntaxError: Unexpected token in JSON at position X
```

**Solución:**
```javascript
// ✅ USAR objetos nativos en Code nodes
return [{
  json: {
    success: true,
    data: { ... }
  }
}];

// Para HTTP Request, usar bodyParameters en vez de jsonBody
"bodyParameters": {
  "parameters": [
    { "name": "gcal_event_id", "value": "={{ $json._gcal_id }}" }
  ]
}
```

**Lección:** ✅ **Nunca usar JSON.stringify en expresiones {{ }} - usar bodyParameters o Code nodes**

---

### 4. Pérdida de Contexto en Ramas IF/Else

**Problema:**
```
Webhook → Generate Key → Check DB → Is Duplicate?
                                           ├─ TRUE → Return Duplicate (pierde ctx)
                                           └─ FALSE → Check Availability (pierde ctx)
```

Cuando Postgres devuelve `[]` (no hay duplicado), el contexto original (`provider_id`, `service_id`, etc.) se pierde.

**Solución - Merge Context Pattern:**

```javascript
// Nodo "Merge Context" después de Is Duplicate? (rama false)
const ctx = $input.first().json.ctx;
ctx._idempotency.is_duplicate = false;
return [{ json: { ctx } }];
```

**Estructura Recomendada:**
```
Generate Idempotency Key → Check DB → Is Duplicate?
                                      ├─ TRUE → Return Duplicate (preserva ctx)
                                      └─ FALSE → Merge Context → Check Availability
```

**Lección:** ✅ **Siempre preservar `ctx` en todas las ramas con nodos Merge explícitos**

---

## 🏗️ Patrones de Diseño Validados

### 1. Context Object Pattern ✅

```javascript
// En "Generate Idempotency Key"
const ctx = {
  // Datos originales
  provider_id: input.provider_id,
  service_id: input.service_id,
  start_time: input.start_time,
  
  // Idempotency
  idempotency_key: sanitizedKey,
  
  // Metadata
  _idempotency: { key: sanitizedKey, created_at: ... },
  _meta: { source: 'WF2', version: '2.0.0', started_at: ... }
};

return [{ json: { ctx } }];
```

**Ventajas:**
- Todo el contexto viaja en `$json.ctx`
- Fácil de debuggear
- Previene pérdida de datos en ramas

---

### 2. Standard Contract Pattern ✅

```javascript
return [{
  json: {
    success: boolean,
    error_code: null | "CODE",
    error_message: null | "message",
    data: {...} | null,
    _meta: {
      source: "WF2_BOOKING_ORCHESTRATOR",
      timestamp: "ISO8601",
      version: "2.0.0"
    }
  }
}];
```

**Obligatorio en:**
- Todos los workflows raíz
- Todos los sub-workflows
- Todos los error handlers

---

### 3. Validation Sandwich ✅

```
PRE → OP → POST
 │    │     └─ Log to DB
 │    └─ Check DB / HTTP / GCal
 └─ Validate input (required fields, regex)
```

**Implementación:**
```javascript
// PRE - En "Generate Idempotency Key"
const required = ['provider_id', 'service_id', 'start_time'];
for (const field of required) {
  if (!input[field]) {
    throw new Error(`Missing required field: ${field}`);
  }
}

// POST - En nodos de error
ctx._meta.failed_at = 'Check Availability';
return [{ json: { ctx, success: false, error_code: 'NO_AVAILABILITY', ... } }];
```

---

### 4. Error Handler con Skip Logic ✅

```
Error Trigger → Extract Context → Build Payload → Has IDs?
                                                      ├─ YES → Rollback
                                                      └─ NO → Skip & Log
```

**Código Clave:**
```javascript
// Build Rollback Payload
const hasValidId = !!(rollback.booking_id || rollback.gcal_event_id || rollback.lock_id || rollback.lock_key);

// Has Rollback Data? (IF node)
value: "={{ $json.has_valid_id }}"
operation: "true"
```

---

## 🚫 Anti-Patrones (NUNCA HACER)

### 1. ❌ Llamar Rollback Sin Verificar IDs

```javascript
// MAL - Siempre llama a rollback
"Trigger WF6 Rollback" → Siempre se ejecuta

// BIEN - Solo si hay IDs
"Has Rollback Data?" → "Trigger WF6 Rollback" (solo si true)
```

---

### 2. ❌ Usar JSON.stringify en Expresiones

```javascript
// MAL
"jsonBody": "={{ JSON.stringify({ id: $json.id }) }}"

// BIEN
"bodyParameters": {
  "parameters": [
    { "name": "id", "value": "={{ $json.id }}" }
  ]
}
```

---

### 3. ❌ Acceder a Nodos Sin Verificar Ejecución

```javascript
// MAL - Crash si "Check Availability" no se ejecutó
const avail = $('Check Availability').first().json;

// BIEN
const avail = $('Check Availability').isExecuted 
  ? $('Check Availability').first().json 
  : null;
```

---

### 4. ❌ Hardcodear Credenciales o IDs

```javascript
// MAL
const credentialId = "5LzvCP9BsQwCi9Z0";

// BIEN - Usar Credential Store de n8n
// (Se configura en la UI del nodo)
```

---

## 📊 Checklist para Futuros Workflows

### Pre-Deployment

- [ ] **Standard Contract** en todos los outputs
- [ ] **Validation Sandwich** (PRE → OP → POST)
- [ ] **Context Object** preservado en todas las ramas
- [ ] **Error Handler** configurado con skip logic
- [ ] **Credenciales** validadas en UI de n8n
- [ ] **Webhook path** único (no duplicado)
- [ ] **Nodos Code** sin JSON.stringify en expresiones
- [ ] **Nodos HTTP** usando bodyParameters (no jsonBody)

### Post-Deployment

- [ ] **Test manual** con payload mínimo
- [ ] **Test manual** con payload completo
- [ ] **Verificar ejecuciones** en UI de n8n
- [ ] **Verificar logs** en DB (system_logs)
- [ ] **Test idempotencia** (mismo payload 2 veces)
- [ ] **Test error handling** (forzar error)

### Testing Automatizado

- [ ] **Jest configurado** con `maxWorkers: 1`
- [ ] **Tests de happy path** (éxito)
- [ ] **Tests de error path** (fallos)
- [ ] **Tests de contexto** (preservación en ramas)
- [ ] **Tests de idempotencia** (duplicados)

---

## 🛠️ Scripts de Debugging Útiles

### 1. Obtener Última Ejecución con Error

```typescript
// scripts-ts/get_wf2_last_exec.ts
const executions = await axios.get(
  `${N8N_API_URL}/api/v1/executions?workflowId=${WF2_ID}&limit=1`,
  { headers: { 'X-N8N-API-KEY': API_KEY } }
);

const detail = await axios.get(
  `${N8N_API_URL}/api/v1/executions/${exec.id}`,
  { headers: { 'X-N8N-API-KEY': API_KEY } }
);

console.log('Last node:', detail.data.data.resultData.lastNodeExecuted);
console.log('Error:', detail.data.data.resultData.error);
```

---

### 2. Test Webhook Minimal

```bash
# Crear workflow minimal (solo Webhook + Code)
curl -X POST https://n8n.stax.ink/webhook/booking-orchestrator \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Expected: {"success": true, "message": "WF2 is working!"}
```

---

### 3. Verificar Credenciales

```bash
# Listar workflows activos y sus credenciales
npx tsx n8n_crud_agent.ts --list-active

# Obtener workflow específico
npx tsx n8n_crud_agent.ts --get <workflow-id>
```

---

## 📈 Métricas de Calidad

| Métrica | Objetivo | Actual |
|---------|----------|--------|
| Standard Contract | 100% | ✅ 100% |
| Context Preservation | 100% | ✅ 100% |
| Error Handler Skip Logic | 100% | ✅ 100% |
| Tests Automatizados | ≥80% | ⏳ Pendiente |
| Workflows Funcionales | 100% | ❌ WF2 fallando |

---

## 🔗 Referencias

- **GEMINI.md** - System prompt v4.2 (N8N Automation Engineer)
- **PASO_1_ERROR_HANDLER.md** - Error Handler setup
- **PASO_2_CIRCUIT_BREAKER.md** - Circuit Breaker pattern
- **PASO_4_DEAD_LETTER_QUEUE.md** - DLQ y reintentos
- **LESSONS_LEARNED_SEED_2026-03-12.md** - Seed workflow lessons

---

## 📝 Notas Adicionales

### Workflow IDs Actuales (2026-03-14)

| Workflow | ID | Estado |
|----------|-----|--------|
| WF2_Booking_Orchestrator | `ZgiDJcBT61v43NvN` | ⚠️ Debugging |
| WF2_Error_Handler | `DW3wMB9KP5BR4JoM` | ✅ Funcional |
| WF6_Rollback_Workflow | `hJtyeGLsMtOxLbAd` | ✅ Funcional |
| WF7_Distributed_Lock | `fhjJXp5DWLjbsem1` | ✅ Funcional |
| CB_GCal_Circuit_Breaker | `G15qrYLDth6n5WR7` | ✅ Funcional |
| DLQ_Manager | `DI8ybMP3MF0UldhT` | ✅ Funcional |

### Próximos Pasos

1. Debugear nodo específico que causa crash en WF2
2. Probar nodos individualmente (Postgres → HTTP → GCal)
3. Ejecutar tests 1-2-3 una vez funcional
4. Actualizar workflow_activation_order.json

---

**Documento creado:** 2026-03-14  
**Última actualización:** 2026-03-14  
**Autor:** AI Engineering Team
