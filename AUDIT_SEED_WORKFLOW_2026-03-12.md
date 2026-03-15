# 🔍 AUDITORÍA TÉCNICA: SEED_Book_Tomorrow & SUB_Seed_Single_Booking

**Fecha:** 2026-03-12  
**Auditado por:** Qwen Code (con skills n8n-workflow-patterns, n8n-validation-expert, postgresql-database-engineering)  
**Estado:** ⚠️ CRÍTICO - Workflow no funcional

---

## 📋 RESUMEN EJECUTIVO

| Componente | Estado | Problema Principal |
|------------|--------|-------------------|
| **SEED_Book_Tomorrow** | ❌ FAIL | Error en ejecución, no genera reservas |
| **SUB_Seed_Single_Booking** | ⚠️ RIESGO | Mapping de datos potencialmente incorrecto |
| **Base de Datos** | ✅ OK | Schema correcto, sin colisiones (0 reservas) |
| **Google Calendar Sync** | ⚠️ PENDIENTE | No verificable (0 reservas) |

---

## 🔎 HALLAZGOS DETALLADOS

### 1. Workflow SEED_Book_Tomorrow (ID: HxMojMqbRiNgquvd)

**Configuración Actual:**
```json
{
  "name": "SEED_Book_Tomorrow",
  "status": "ACTIVE",
  "webhook": "POST /webhook/seed-tomorrow",
  "nodes": 5
}
```

**Flujo:**
```
Manual Trigger / Webhook 
  → Build Seed Config (Code node) 
  → Execute Sub-workflow (qCCOLoAHJTl1BibE) 
  → Standard Contract Output
```

**❌ PROBLEMAS DETECTADOS:**

| # | Problema | Severidad | Evidencia |
|---|----------|-----------|-----------|
| 1.1 | **Workflow falla silenciosamente** | CRÍTICA | `curl POST /webhook/seed-tomorrow` retorna `{"message":"Error in workflow"}` sin registro en ejecuciones |
| 1.2 | **Sin ejecuciones registradas** | CRÍTICA | API n8n devuelve 0 ejecuciones para workflowId=HxMojMqbRiNgquvd |
| 1.3 | **TypeVersion desactualizado** | MEDIA | ExecuteWorkflow usa v1.3, skill recomienda v1.3+ (compatible pero verificar) |
| 1.4 | **Sin manejo de errores** | ALTA | No hay conexión a NN_00_Global_Error_Handler |

**Análisis del Code Node (Build Seed Config):**
```javascript
// Genera 8 slots para mañana (09:00 - 16:00)
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const date = tomorrow.toISOString().split('T')[0];
const slots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
return slots.map((time, i) => ({
  json: {
    provider_id: 1,
    service_id: 1,
    start_time: `${date}T${time}:00.000-03:00`,
    chat_id: 9800000 + i,
    user_name: 'Seed Patient ' + String.fromCharCode(65+i),
    user_email: 'seed@test.local'
  }
}));
```

✅ **Lógica correcta:** Genera 8 items con:
- provider_id: 1 (fijo)
- service_id: 1 (fijo)
- chat_id único: 9800000-9800007
- user_name único: Seed Patient A-H
- start_time: slots de 1 hora sin solapamiento

---

### 2. Sub-workflow SUB_Seed_Single_Booking (ID: qCCOLoAHJTl1BibE)

**Flujo:**
```
Execute Workflow Trigger 
  → Create Booking (DAL) [POST /create-booking]
  → Create GCAL Event [POST /gcal-create-event]
  → Update DB with GCAL ID [POST /update-gcal-event-id]
```

**⚠️ PROBLEMAS DE MAPPING DETECTADOS:**

| # | Nodo | Problema | Línea en JSON |
|---|------|----------|---------------|
| 2.1 | **Create GCAL Event** | Referencia incorrecta a `$('Execute Workflow Trigger').item.json` | El trigger de executeWorkflow NO expone `.item.json` directamente |
| 2.2 | **Update DB with GCAL ID** | Doble fallback para booking_id | `{{ $('Create Booking (DAL)').item.json.data?.booking_id \|\| $('Create Booking (DAL)').item.json.booking_id }}` |

**Detalle del problema 2.1 (CRÍTICO):**

El nodo `Create GCAL Event` intenta acceder a datos del trigger:
```json
"calendar_id": "{{ $('Execute Workflow Trigger').item.json.calendar_id }}",
"user_name": "{{ $('Execute Workflow Trigger').item.json.user_name }}",
```

**Problema:** En n8n v2.10+, el nodo `Execute Workflow Trigger` con `inputSource: "passthrough"` recibe los datos del workflow padre, pero la sintaxis correcta es:
- ❌ `$('Execute Workflow Trigger').item.json` 
- ✅ `$input.first().json` o `$( "Execute Workflow Trigger" ).first().json`

**Riesgo:** Todos los campos que dependen de datos del workflow padre (user_name, start_time, etc.) llegarán como `undefined` al DAL y GCAL.

---

### 3. Auditoría de Base de Datos

**Query ejecutada:**
```sql
SELECT b.*, u.full_name, u.chat_id
FROM bookings b
JOIN users u ON b.user_id = u.chat_id
WHERE u.chat_id >= 9800000
```

**Resultado:** 0 reservas encontradas

✅ **Sin colisiones detectadas** (no hay datos)  
✅ **Schema correcto:** bookings.gcal_event_id es TEXT nullable

---

### 4. Verificación Google Calendar

**Script:** `scripts-ts/extract-gcal.ts`

**Estado:** ⚠️ PENDIENTE DE EJECUCIÓN

**Requisitos:**
- ✅ `googleapis` disponible (vía n8n-nodes-base)
- ✅ `google-auth-library` disponible
- ✅ `.env` configurado (symlink a docker-compose)
- ⚠️ Requiere autenticación OAuth2 (token.json)

**Para ejecutar:**
```bash
npx tsx scripts-ts/extract-gcal.ts 2026-03-13
```

---

## 🛠️ RECOMENDACIONES PRIORIZADAS

### PRIORIDAD 1: Fix de Mapping (CRÍTICO)

**Archivo:** `workflows/SUB_Seed_Single_Booking.json`

**Cambios requeridos en nodo "Create GCAL Event":**

```json
// ANTES (incorrecto):
"calendar_id": "{{ $('Execute Workflow Trigger').item.json.calendar_id }}",
"user_name": "{{ $('Execute Workflow Trigger').item.json.user_name }}",

// DESPUÉS (correcto):
"calendar_id": "{{ $input.first().json.calendar_id }}",
"user_name": "{{ $input.first().json.user_name }}",
```

**Cambios en nodo "Update DB with GCAL ID":**

```json
// ANTES (doble fallback confuso):
"booking_id": "{{ $('Create Booking (DAL)').item.json.data?.booking_id || $('Create Booking (DAL)').item.json.booking_id }}",

// DESPUÉS (explícito con $input):
"booking_id": "{{ $input.first().json.data?.booking_id || $input.first().json.booking_id }}",
```

---

### PRIORIDAD 2: Agregar Error Handling

**Archivo:** `workflows/SEED_Book_Tomorrow.json`

**Añadir:**
1. Conexión desde cada nodo HTTP Request a `NN_00_Global_Error_Handler`
2. Nodo Catch Error después de `Execute Sub-workflow`

---

### PRIORIDAD 3: Validación de DAL Endpoints

**Verificar que los endpoints existen y están activos:**

```bash
# 1. Create Booking
curl -X POST http://dal-service:3000/create-booking \
  -H "Content-Type: application/json" \
  -d '{"chat_id": 9800000, "provider_id": 1, "service_id": 1, "start_time": "2026-03-13T09:00:00.000-03:00", "user_name": "Test", "user_email": "test@test.local"}'

# 2. Update GCAL Event ID
curl -X POST http://dal-service:3000/update-gcal-event-id \
  -H "Content-Type: application/json" \
  -d '{"booking_id": "uuid-here", "gcal_event_id": "gcal-id-here"}'
```

---

### PRIORIDAD 4: Test de Ejecución

**Pasos:**

1. **Fix del mapping** en SUB_Seed_Single_Booking
2. **Re-importar workflow** en n8n
3. **Ejecutar manual:**
   ```bash
   curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow
   ```
4. **Verificar DB:**
   ```bash
   npx tsx scripts-ts/audit_seed_bookings.ts 2026-03-13
   ```
5. **Verificar GCAL:**
   ```bash
   npx tsx scripts-ts/extract-gcal.ts 2026-03-13
   ```

---

## 📊 MÉTRICAS DE COMPLIANCE

| Métrica | Target | Actual | Estado |
|---------|--------|--------|--------|
| Triple Entry Pattern | ✅ | ✅ (Manual + Webhook) | OK |
| Standard Contract Output | ✅ | ✅ | OK |
| Error Handler Conectado | ✅ | ❌ | FAIL |
| Node Type Versions | ✅ | ⚠️ | WARNING |
| Mapping Correcto | ✅ | ❌ | FAIL |
| Sin Colisiones | ✅ | ✅ (0 reservas) | OK |
| GCAL Sync | ✅ | ⚠️ | PENDING |

**Compliance Total:** 4/7 (57%) ⚠️

---

## 📝 ARCHIVOS DE AUDITORÍA CREADOS

| Archivo | Propósito |
|---------|-----------|
| `scripts-ts/audit_seed_bookings.ts` | Auditoría DB de reservas seed |
| `scripts-ts/check_seed_executions.ts` | Verificar ejecuciones en n8n |
| `scripts-ts/check_seed_last_error.ts` | Obtener último error de ejecución |
| `AUDIT_SEED_WORKFLOW_2026-03-12.md` | Este informe |

---

## 🔗 REFERENCIAS A SKILLS USADAS

- **n8n-workflow-patterns**: Validación de estructura de workflows
- **n8n-validation-expert**: Detección de errores de configuración
- **n8n-node-configuration**: Verificación de mapping en Execute Workflow
- **n8n-code-javascript**: Revisión de Code nodes
- **postgresql-database-engineering**: Auditoría de schema y queries

---

**Próxima acción recomendada:** Aplicar fix de PRIORIDAD 1 en `SUB_Seed_Single_Booking.json` y re-ejecutar.

**Generado por:** Qwen Code  
**Timestamp:** 2026-03-12T13:45:00-03:00
