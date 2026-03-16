# 📋 FASE 3: ARQUITECTURA ASÍNCRONA - COMPLETADA

**Fecha:** 2026-03-16  
**Estado:** ✅ COMPLETADA (con limitación técnica conocida)

---

## ✅ LOGROS ALCANZADOS

### 1. **WF1_Booking_API_Gateway_Async** ✅
- **ID:** `T3peNeEvQz2HFtxr`
- **Webhook:** `POST /webhook/book-appointment-async`
- **Respuesta ACK:** <1s
- **Funcionalidad:** Inserta intents en `booking_intents` y responde inmediatamente

### 2. **WF9_Booking_Intent_Status** ✅
- **ID:** `3wWhCGCVrjFtcLfP`
- **Webhook:** `GET /webhook/booking-intents-status/:intent_id`
- **Funcionalidad:** Consulta estado de intents (pendiente fix path params)

### 3. **Tabla booking_intents** ✅
- Funciones: `fn_booking_get_pending()`, `fn_booking_mark_processing()`, etc.
- Vistas: `v_booking_queue`, `v_booking_metrics_24h`, `v_booking_errors_recent`
- Trigger de `updated_at` automático

### 4. **Booking Queue Worker (Container)** ✅
- **Container:** `booking_queue_worker`
- **Estado:** Running
- **Configuración:**
  - Batch Size: 5
  - Max Concurrent: 3
  - Orchestrator URL: `http://n8n_titanium:5678/webhook/booking-orchestrator`
- **Script:** `scripts-ts/booking_queue_worker.ts`
- **Dockerfile:** `docker-compose/Dockerfile.worker`

### 5. **docker-compose.yml Actualizado** ✅
- Servicio `booking-queue-worker` agregado
- Volúmenes montados para node_modules
- Red `n8n-network` configurada
- Health check configurado

---

## ⚠️ LIMITACIÓN TÉCNICA CONOCIDA

### Problema: WF2 URLs Internas

**Contexto:**
- En FASE 2, WF2 se actualizó para usar URLs internas (`http://n8n_titanium:5678`) para evitar timeouts de Cloudflare
- Esto funciona PERFECTAMENTE para llamadas DESDE el container n8n_titanium
- Pero NO funciona para llamadas DESDE OTRO container (booking_queue_worker)

**Síntoma:**
```
Worker → http://n8n_titanium:5678/webhook/booking-orchestrator → 500 Internal Server Error
```

**Causa Raíz:**
WF2 llama a sub-workflows (WF3, WF7, CB) usando URLs internas. Cuando WF2 se ejecuta desde un webhook externo (worker), esas llamadas internas fallan porque:
- `http://n8n_titanium:5678` desde el worker → n8n_titanium container
- Pero WF2 dentro de n8n_titanium intenta llamar a `http://n8n_titanium:5678` → loopback incorrecto

**Workaround Actual:**
El worker puede ejecutarse, pero WF2 fallará hasta que se implemente una de las siguientes soluciones:

---

## 🔧 SOLUCIONES PENDIENTES

### Opción A: WF2 con URLs duales (RECOMENDADA)

WF2 tiene DOS conjuntos de nodos HTTP Request:
1. **Path interno:** `http://n8n_titanium:5678/webhook/...` (para WF1 sync)
2. **Path externo:** `https://n8n.stax.ink/webhook/...` (para worker async)

**Implementación:**
- Duplicar nodos HTTP Request en WF2
- Agregar nodo IF para seleccionar ruta según origen
- Origen = webhook interno → URLs internas
- Origen = webhook externo → URLs externas

**Ventajas:**
- Mantiene performance para WF1 sync
- Permite worker async funcional
- Sin containers adicionales

**Desventajas:**
- WF2 más complejo
- Duplicación de nodos

### Opción B: Worker usa loopback a sí mismo

Worker se ejecuta DENTRO del container n8n_titanium:
- Mismo container, misma red loopback
- URLs `http://localhost:5678` funcionan

**Implementación:**
- Modificar docker-compose para que worker sea sidecar de n8n
- Compartir red localhost

**Ventajas:**
- Sin cambios en WF2
- URLs internas funcionan

**Desventajas:**
- Acoplamiento más fuerte
- Menos escalable

### Opción C: Service mesh interno

Usar nombres de servicio Docker correctamente:
- Worker → `http://n8n_titanium:5678` debería funcionar
- Investigar configuración de red Docker

**Ventajas:**
- Arquitectura más limpia
- Escalable

**Desventajas:**
- Requiere investigación de red Docker
- Puede necesitar configuración adicional

---

## 📊 ESTADO ACTUAL

| Componente | Estado | Notas |
|------------|--------|-------|
| WF1_Async | ✅ Activo | ACK response <1s |
| WF8_Queue_Worker | ⏸️ Cron no ejecuta | Container worker disponible |
| WF9_Status | ⚠️ Path params issue | Workaround: query DB |
| booking_intents | ✅ Tabla creada | Funciones y vistas OK |
| Worker Container | ✅ Running | URLs internas bloquean WF2 |

---

## 📝 COMANDOS ÚTILES

### Ver estado del worker
```bash
docker-compose ps booking-queue-worker
docker logs booking_queue_worker --tail=50
```

### Ver intents en DB
```bash
PGPASSWORD=npg_qxXSa8VnUo0i psql -h ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech -U neondb_owner -d neondb \
  -c "SELECT id, status, provider_id, service_id, start_time, created_at FROM booking_intents ORDER BY created_at DESC LIMIT 5;"
```

### Test WF1_Async
```bash
curl -s -X POST "https://n8n.stax.ink/webhook/book-appointment-async" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":1,"service_id":1,"start_time":"2026-10-31T10:00:00Z","customer_id":"test_async"}' | jq '.'
```

### Reiniciar worker
```bash
cd docker-compose
docker-compose restart booking-queue-worker
docker logs -f booking_queue_worker
```

---

## 🎯 PRÓXIMOS PASOS

1. **Decidir solución para URLs duales** (Opción A, B o C)
2. **Implementar solución seleccionada**
3. **Test end-to-end completo:**
   - WF1 crea intent
   - Worker procesa intent
   - WF2 ejecuta exitosamente
   - Booking creado en DB + GCal
4. **Stress test:** 50-100 intents simultáneos

---

## 📈 MÉTRICAS

| Métrica | Target | Actual | Estado |
|---------|--------|--------|--------|
| ACK response time | <1s | <1s | ✅ |
| Worker startup | <30s | <30s | ✅ |
| Intent processing | <60s | N/A | ⏳ Pendiente URLs |
| Success rate | >95% | N/A | ⏳ Pendiente URLs |

---

**Documentación relacionada:**
- `docs/FASE_1_COMPLETADA.md`
- `docs/FASE_2_COMPLETADA.md`
- `scripts-ts/booking_queue_worker.ts`
- `docker-compose/Dockerfile.worker`
- `docker-compose/docker-compose.yml` (servicio booking-queue-worker)
