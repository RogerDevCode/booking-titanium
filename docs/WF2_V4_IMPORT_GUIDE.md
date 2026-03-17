# 📥 WF2 v4.0 - GUÍA DE IMPORTACIÓN

**Fecha:** 2026-03-17  
**Archivo:** `workflows/seed_clean/WF2_Booking_Orchestrator_v4_FINAL.json`  
**Estado:** ✅ LISTO PARA IMPORTAR

---

## 📋 RESUMEN WF2 v4.0

| Característica | Valor |
|----------------|-------|
| **Nodos** | 27 |
| **HTTP Request** | 0 (todo interno) |
| **Sub-workflows** | 0 |
| **Node Versions** | Code v2, IF v2.3, Postgres v2.6, GCal v1.3, Webhook v2.1 |
| **Credenciales** | Postgres + Google Calendar |
| **Webhook** | POST /booking-orchestrator-v4 |

---

## 🚀 PASOS PARA IMPORTAR

### Paso 1: Abrir n8n UI

1. Ir a: https://n8n.stax.ink
2. Loguearse
3. Click en **"Workflows"** (sidebar izquierdo)

---

### Paso 2: Importar JSON

1. Click en **"Add workflow"** (top-right)
2. Click en **menú de 3 puntos** (top-right) → **"Import from File"**
3. Seleccionar archivo:
   ```
   /home/manager/Sync/N8N_Projects/booking-titanium/workflows/seed_clean/WF2_Booking_Orchestrator_v4_FINAL.json
   ```
4. Esperar a que cargue (5-10 segundos)
5. Verificar que aparecen **27 nodos**

---

### Paso 3: Verificar Nodos

**Lista de nodos que deberían aparecer:**

| # | Nodo | Tipo | Versión |
|---|------|------|---------|
| 1 | Webhook | webhook | 2.1 ✅ |
| 2 | Validate Input | code | 2 ✅ |
| 3 | Check Idempotency | postgres | 2.6 ✅ |
| 4 | Process Idempotency | code | 2 ✅ |
| 5 | Is Duplicate? | if | 2.3 ✅ |
| 6 | Build Lock Query | code | 2 ✅ |
| 7 | Acquire Lock | postgres | 2.6 ✅ |
| 8 | Process Lock | code | 2 ✅ |
| 9 | Lock Acquired? | if | 2.3 ✅ |
| 10 | Build CB Query | code | 2 ✅ |
| 11 | Check Circuit Breaker | postgres | 2.6 ✅ |
| 12 | Process Circuit Breaker | code | 2 ✅ |
| 13 | CB Allowed? | if | 2.3 ✅ |
| 14 | Build Avail Query | code | 2 ✅ |
| 15 | Check Availability | postgres | 2.6 ✅ |
| 16 | Process Availability | code | 2 ✅ |
| 17 | Is Available? | if | 2.3 ✅ |
| 18 | Create GCal Event | googleCalendar | 1.3 ✅ |
| 19 | Process GCal | code | 2 ✅ |
| 20 | GCal Success? | if | 2.3 ✅ |
| 21 | Create Booking | postgres | 2.6 ✅ |
| 22 | Process Booking | code | 2 ✅ |
| 23 | Booking Success? | if | 2.3 ✅ |
| 24 | Release Lock Success | postgres | 2.6 ✅ |
| 25 | Success Output | code | 2 ✅ |
| 26 | Error Output | code | 2 ✅ |
| 27 | Release Lock Error | postgres | 2.6 ✅ |

**✅ Si todos los nodos aparecen → Continuar**  
**❌ Si faltan nodos → Re-importar JSON**

---

### Paso 4: Configurar Credenciales

#### 4.1 Postgres Account

1. Click en cualquier nodo **postgres** (ej: "Check Idempotency")
2. En **"Credential"** → Click en dropdown
3. Seleccionar: **"Postgres account"** (ID: `SFNQsmuu4zirZAnP`)
4. Si no existe, crear nueva:
   - **Host:** `ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech`
   - **Database:** `neondb`
   - **User:** `neondb_owner`
   - **Password:** `<tu_password>`
   - **SSL:** `allow`

#### 4.2 Google Calendar Account

1. Click en nodo **"Create GCal Event"**
2. En **"Credential"** → Click en dropdown
3. Seleccionar: **"Google Calendar account"** (ID: `OsRBfz3Cs7Ph5uV5`)
4. Si no existe, crear nueva:
   - **OAuth2:** Conectar con Google
   - **Email:** `dev.n8n.stax@gmail.com`

---

### Paso 5: Verificar Conexiones

1. Click en **"Execute workflow"** (top-right) para validar
2. Verificar que **todas las líneas de conexión** aparecen
3. Verificar que no hay nodos desconectados

**Flujo esperado:**
```
Webhook → Validate → Idempotency → Is Duplicate?
  ├─ TRUE → Error Output → Release Lock → [FIN]
  └─ FALSE → Lock → CB → Availability → GCal → DB → Release Lock → Success
```

---

### Paso 6: Activar Workflow

1. Click en **toggle "Active"** (top-right)
2. Confirmar activación
3. Verificar mensaje: **"Workflow activated successfully"**

---

### Paso 7: Obtener Webhook URL

1. Click en nodo **"Webhook"**
2. Copiar **"Production URL"**:
   ```
   https://n8n.stax.ink/webhook/booking-orchestrator-v4
   ```
3. Guardar para tests

---

## 🧪 TESTS DE VALIDACIÓN

### Test 1: Validación de Input (Missing Field)

```bash
curl -X POST "https://n8n.stax.ink/webhook/booking-orchestrator-v4" \
  -H "Content-Type: application/json" \
  -d '{"service_id":1,"start_time":"2026-10-31T10:00:00Z"}'
```

**Expected Response:**
```json
{
  "success": false,
  "error_code": "MISSING_FIELD",
  "error_message": "Missing: provider_id",
  "data": null,
  "_meta": {...}
}
```

---

### Test 2: Validación de Input (Invalid Type)

```bash
curl -X POST "https://n8n.stax.ink/webhook/booking-orchestrator-v4" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":"abc","service_id":1,"start_time":"2026-10-31T10:00:00Z"}'
```

**Expected Response:**
```json
{
  "success": false,
  "error_code": "INVALID_TYPE",
  "error_message": "provider_id/service_id must be numeric",
  "data": null,
  "_meta": {...}
}
```

---

### Test 3: Happy Path (Booking Exitoso)

```bash
curl -X POST "https://n8n.stax.ink/webhook/booking-orchestrator-v4" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id":1,
    "service_id":1,
    "start_time":"2026-10-31T10:00:00Z",
    "customer_id":"test_v4_import",
    "event_title":"Test Booking v4"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "error_code": null,
  "data": {
    "booking_id": <number>,
    "idempotency_key": "booking_1_1_20261031100000_test_v4_import",
    "provider_id": 1,
    "service_id": 1,
    "start_time": "2026-10-31T10:00:00Z",
    "end_time": "2026-10-31T11:00:00Z",
    "status": "CONFIRMED",
    "gcal_event_id": "<gcal_id>",
    "is_duplicate": false
  },
  "_meta": {...}
}
```

---

### Test 4: Idempotencia (Duplicate Detection)

```bash
# Mismo request que Test 3 (2da vez)
curl -X POST "https://n8n.stax.ink/webhook/booking-orchestrator-v4" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id":1,
    "service_id":1,
    "start_time":"2026-10-31T10:00:00Z",
    "customer_id":"test_v4_import",
    "event_title":"Test Booking v4"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "booking_id": <mismo_id_que_test_3>,
    "is_duplicate": true,
    ...
  }
}
```

---

## 🔍 VERIFICACIÓN POST-IMPORT

### 1. Verificar en DB

```bash
PGPASSWORD=npg_qxXSa8VnUo0i psql -h ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech \
  -U neondb_owner -d neondb \
  -c "SELECT id, provider_id, service_id, start_time, status, gcal_event_id, created_at FROM bookings WHERE idempotency_key LIKE '%test_v4_import%' ORDER BY created_at DESC LIMIT 5;"
```

**Expected:** Al menos 1 row con status `CONFIRMED`

---

### 2. Verificar en GCal

1. Ir a: https://calendar.google.com
2. Loguearse con `dev.n8n.stax@gmail.com`
3. Buscar evento: **"Test Booking v4"**
4. Fecha: `2026-10-31 10:00 AM`

**Expected:** Evento creado

---

### 3. Verificar Ejecuciones en n8n

1. En n8n UI, click en workflow **"WF2_Booking_Orchestrator_v4"**
2. Click en **"Executions"** (sidebar)
3. Verificar últimas 4 ejecuciones (tests 1-4)

**Expected:**
- Test 1: ✅ success (validation error)
- Test 2: ✅ success (validation error)
- Test 3: ✅ success (booking created)
- Test 4: ✅ success (duplicate detected)

---

## ⚠️ TROUBLESHOOTING

### Error: "Credential not found"

**Síntoma:** Nodos postgres/GCal muestran error de credencial

**Solución:**
1. Click en nodo con error
2. En **"Credential"** → Seleccionar credencial existente
3. O crear nueva con datos correctos

---

### Error: "Webhook not registered"

**Síntoma:** Test curl retorna 404

**Solución:**
1. Verificar workflow está **ACTIVO** (toggle verde)
2. Click en nodo **"Webhook"**
3. Copiar **"Production URL"** (no "Test URL")
4. Reintentar test

---

### Error: "runData null"

**Síntoma:** Ejecución muestra success pero no hay datos

**Causa:** Bug de queue mode (debería NO ocurrir en v4.0)

**Solución:**
1. Verificar nodo **"Success Output"** está conectado
2. Verificar nodo **"Process Booking"** retorna datos
3. Si persiste → Revisar logs de n8n

---

### Error: "Lock not released"

**Síntoma:** Mismo slot no se puede bookear 2da vez

**Solución:**
1. Verificar nodo **"Release Lock Error"** está conectado
2. Ejecutar manual para liberar lock:
   ```sql
   DELETE FROM booking_locks WHERE lock_key LIKE 'lock_1_2026-10-31%';
   ```

---

## 📊 MÉTRICAS ESPERADAS

| Métrica | Target | Cómo Verificar |
|---------|--------|----------------|
| Nodos importados | 27/27 | Contar en UI |
| Credenciales configuradas | 2/2 | Verificar en nodos |
| Conexiones | 26/26 | Verificar líneas |
| Test 1 (validation) | ✅ | curl + response |
| Test 2 (validation) | ✅ | curl + response |
| Test 3 (happy path) | ✅ | curl + DB + GCal |
| Test 4 (idempotency) | ✅ | curl + same booking_id |

---

## ✅ CHECKLIST FINAL

- [ ] JSON importado correctamente
- [ ] 27 nodos visibles
- [ ] Credencial Postgres configurada
- [ ] Credencial GCal configurada
- [ ] Todas las conexiones verificadas
- [ ] Workflow activado
- [ ] Webhook URL copiado
- [ ] Test 1 pasado (validation)
- [ ] Test 2 pasado (validation)
- [ ] Test 3 pasado (happy path)
- [ ] Test 4 pasado (idempotency)
- [ ] DB verificada (booking creado)
- [ ] GCal verificado (evento creado)
- [ ] Ejecuciones en n8n verificadas

---

**Estado:** ✅ LISTO PARA IMPORTAR  
**Archivo:** `workflows/seed_clean/WF2_Booking_Orchestrator_v4_FINAL.json`  
**Tiempo estimado:** 10-15 minutos  
**Dificultad:** Media

---

**¿Necesitas ayuda con algún paso? ¡Avísame!**
