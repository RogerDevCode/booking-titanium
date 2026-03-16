# 📋 FASE 3: ARQUITECTURA ASÍNCRONA - ESTADO

**Fecha:** 2026-03-16  
**Estado:** ⏳ EN PROGRESO (70% completado)

---

## 🎯 OBJETIVOS FASE 3

- [x] Crear WF1_Booking_API_Gateway_Async
- [x] Crear WF9_Booking_Intent_Status
- [x] Crear tabla booking_intents (FASE 1)
- [x] WF8_Booking_Queue_Worker creado y activo
- [ ] WF8 Cron Trigger funcionando ⚠️ **BLOQUEANTE**
- [ ] End-to-end test completado

---

## 🔧 CAMBIOS REALIZADOS

### 1. **WF1_Booking_API_Gateway_Async** ✅

**ID:** `T3peNeEvQz2HFtxr`  
**Estado:** ACTIVO  
**Webhook:** `POST /webhook/book-appointment-async`

**Flujo:**
```
Webhook → Validate Request → Is Valid? → Insert booking_intents → ACK Response
```

**Respuesta Inmediata (ACK):**
```json
{
  "success": true,
  "error_code": null,
  "error_message": null,
  "data": {
    "intent_id": "9ce38806-4ec5-46ce-98e0-44d12e394fa2",
    "status": "QUEUED",
    "provider_id": 1,
    "service_id": 1,
    "start_time": "2026-10-31T10:00:00Z",
    "message": "Booking request queued for asynchronous processing",
    "estimated_processing_time": "30-60 seconds",
    "check_status_endpoint": "/api/v1/booking-intents/9ce38806-4ec5-46ce-98e0-44d12e394fa2"
  }
}
```

**Test Result:** ✅ FUNCIONA
- Intent insertado correctamente en DB
- Respuesta ACK en <1s
- Sin timeouts

---

### 2. **WF9_Booking_Intent_Status** ⚠️

**ID:** `3wWhCGCVrjFtcLfP`  
**Estado:** ACTIVO  
**Webhook:** `GET /webhook/booking-intents-status/:intent_id`

**Problema:** Webhooks con path parameters (`:intent_id`) no se registran automáticamente en n8n v2.10.2.

**Workaround temporal:**
```bash
# Consultar directamente en DB
PGPASSWORD=<pwd> psql -h <host> -U neondb_owner -d neondb \
  -c "SELECT * FROM booking_intents WHERE id = '<intent_id>';"
```

**Solución pendiente:**
- Opción A: Usar query parameter en vez de path param
  - `GET /webhook/booking-intents-status?intent_id=xxx`
- Opción B: Crear endpoint HTTP externo (API Gateway)

---

### 3. **WF8_Booking_Queue_Worker** ⚠️ **BLOQUEANTE**

**ID:** `GaVFL3VwVy5qUrqf`  
**Estado:** ACTIVO  
**Trigger:** Cron cada 30 segundos

**Problema:** Cron Trigger node no se ejecuta automáticamente en n8n v2.10.2.

**Síntomas:**
- Workflow aparece como "active"
- No hay ejecuciones en /api/v1/executions
- Ejecución manual vía API devuelve `null`
- Intents en booking_intents permanecen en PENDING

**Posibles causas:**
1. Cron node requiere configuración especial en queue mode
2. Worker no está procesando triggers de tiempo
3. Bug conocido en n8n v2.10.2 con Cron node

**Soluciones en investigación:**

#### Opción A: Usar Schedule Trigger + Webhook
Reemplazar Cron node con Schedule Trigger node (más estable en queue mode).

#### Opción B: Worker externo (recomendado)
Script Python/Node.js que:
1. Poll cada 30s: `SELECT * FROM fn_booking_get_pending(5)`
2. Por cada intent: llamar a WF2 vía HTTP Request
3. Actualizar estado: `fn_booking_mark_completed()` o `fn_booking_mark_failed()`

#### Opción C: Database trigger + pg_cron
Usar extensión pg_cron en Neon para ejecutar stored procedure directamente.

---

## 📊 ESTADO ACTUAL DE INTENTS

```sql
SELECT status, COUNT(*) 
FROM booking_intents 
GROUP BY status;
```

| status  | count |
|---------|-------|
| PENDING | 1     |

**Intent de test:**
- ID: `9ce38806-4ec5-46ce-98e0-44d12e394fa2`
- Status: PENDING (desde 2026-03-16 22:45:45)
- Processing time: N/A (WF8 no ejecuta)

---

## 🚀 PRÓXIMOS PASOS

### Inmediato (resolver bloqueante):

1. **Investigar Cron node en n8n v2.10.2:**
   ```bash
   docker logs n8n_titanium --tail=200 | grep -i "cron\|schedule\|trigger"
   docker logs n8n_worker_1 --tail=200 | grep -i "cron\|schedule"
   ```

2. **Implementar workaround (Opción B - Worker externo):**
   - Crear script `scripts-ts/booking_queue_worker.ts`
   - Ejecutar como proceso separado o cron job
   - Procesar intents manualmente

3. **Fix WF9 webhook:**
   - Cambiar a query parameter
   - O crear endpoint alternativo

### Esta semana:

4. **End-to-end test:**
   - WF1 crea intent
   - Worker procesa intent
   - WF9 consulta estado
   - Verificar booking creado en DB + GCal

5. **Stress test:**
   - 50-100 intents simultáneos
   - Medir tiempo de procesamiento
   - Ajustar worker concurrency

---

## ⚠️ BLOQUEANTES

| Bloqueante | Impacto | Workaround | Priority |
|------------|---------|------------|----------|
| WF8 Cron Trigger no ejecuta | Intents no se procesan | Worker externo (script) | 🔴 CRÍTICO |
| WF9 path params no funciona | No se puede consultar status | Query DB directo | 🟡 MEDIO |

---

## 📝 COMANDOS ÚTILES

### Ver intents pendientes
```bash
PGPASSWORD=npg_qxXSa8VnUo0i psql -h ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech -U neondb_owner -d neondb \
  -c "SELECT id, provider_id, service_id, start_time, status, created_at FROM booking_intents WHERE status='PENDING';"
```

### Ver ejecuciones de WF8
```bash
curl -s "https://n8n.stax.ink/api/v1/executions?workflowId=GaVFL3VwVy5qUrqf&limit=10" \
  -H "X-N8N-API-Key: $N8N_API_KEY" | jq '.data[] | {id, status, startedAt}'
```

### Test WF1_Async
```bash
curl -s -X POST "https://n8n.stax.ink/webhook/book-appointment-async" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":1,"service_id":1,"start_time":"2026-10-31T10:00:00Z","customer_id":"test_async"}' | jq '.'
```

---

## 📈 MÉTRICAS

| Métrica | Target | Actual | Estado |
|---------|--------|--------|--------|
| ACK response time | <1s | <1s | ✅ |
| Intent processing start | <30s | N/A | ⏳ Pendiente |
| Intent processing complete | <60s | N/A | ⏳ Pendiente |
| Success rate | >95% | N/A | ⏳ Pendiente |

---

**Próxima actualización:** Resolver bloqueante WF8 Cron Trigger  
**ETA:** 24-48h
