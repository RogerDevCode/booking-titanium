# 📋 FASE 4: RESOLUCIÓN BLOQUEANTE WF2 - ESTADO

**Fecha:** 2026-03-16  
**Estado:** ⚠️ BLOQUEADO (queue mode webhook registration issue)

---

## ✅ LOGROS PARCIALES

1. **WF2_Booking_Orchestrator_Worker creado** ✅
   - ID: `Ifx0Yb17cs3WYHbm`
   - URLs: Externas (`https://n8n.stax.ink`)
   - Webhook path: `booking-orchestrator-worker`
   - Estado: Activo

2. **Worker container configurado** ✅
   - ORCHESTRATOR_URL actualizado
   - Apunta a webhook externo

3. **WF1 sync mantiene URLs internas** ✅
   - ID: `Z7g7DgxXQ61V368P`
   - URLs: Internas (`http://n8n_titanium:5678`)
   - Performance preservada

---

## ⚠️ BLOQUEANTE ACTUAL

### Problema: Webhooks no se registran en Queue Mode

**Síntoma:**
```bash
curl -X POST https://n8n.stax.ink/webhook/booking-orchestrator-worker
# Response: {"message":"Error in workflow"}
# Execution: status=error, lastNodeExecuted=null
```

**Causa Raíz:**
En n8n v2.10.2 con queue mode, los webhooks necesitan:
1. Workflow activo ✅
2. Webhook registrado en memoria del webhook handler ⚠️
3. Worker disponible para ejecutar ✅

El paso 2 falla porque el webhook handler no carga los webhooks correctamente después de actualizar el workflow.

---

## 🔧 WORKAROUNDS INTENTADOS

| Workaround | Resultado |
|------------|-----------|
| Toggle activate/deactivate | ⚠️ Webhook responde pero con error |
| Reiniciar container n8n | ⏳ Pendiente |
| Re-crear workflow desde cero | ⏳ Pendiente |

---

## 📊 ARQUITECTURA ACTUAL

```
┌──────────────────────────────────────────────────────────────┐
│                    WORKFLOWS DISPONIBLES                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  WF1_Booking_API_Gateway (2G9ffjvKyF5bqDT5)                  │
│    ↓                                                         │
│  WF2_Booking_Orchestrator (Z7g7DgxXQ61V368P)                 │
│    - URLs: INTERNAS (http://n8n_titanium:5678) ✅            │
│    - Uso: WF1 sync                                           │
│                                                              │
│  WF2_Booking_Orchestrator_Worker (Ifx0Yb17cs3WYHbm)          │
│    - URLs: EXTERNAS (https://n8n.stax.ink) ✅                │
│    - Uso: Worker async                                       │
│    - Estado: ⚠️ Webhook registration issue                   │
│                                                              │
│  WF8_Booking_Queue_Worker (GaVFL3VwVy5qUrqf)                 │
│    - Estado: ⏸️ Cron no ejecuta                              │
│    - Workaround: Container externo                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎯 PRÓXIMOS PASOS

### Inmediato (para commit):
1. ✅ Documentar estado actual
2. ✅ Commit de cambios (WF2_Worker, worker container, docs)
3. ⏳ Push al repositorio

### Post-Commit (experimentación):
1. Reiniciar n8n_titanium para forzar webhook registration
2. O re-crear WF2_Worker desde cero
3. O investigar queue mode webhook registration bug

---

## 📝 COMANDOS PARA DEBUG

### Ver estado de webhooks activos
```bash
curl -s "https://n8n.stax.ink/api/v1/active-workflows" \
  -H "X-N8N-API-Key: $N8N_API_KEY" | jq '.data[] | select(.triggerType=="webhook")'
```

### Test webhook WF2_Worker
```bash
curl -s -X POST "https://n8n.stax.ink/webhook/booking-orchestrator-worker" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":1,"service_id":1,"start_time":"2026-10-31T10:00:00Z"}'
```

### Ver ejecuciones recientes
```bash
curl -s "https://n8n.stax.ink/api/v1/executions?workflowId=Ifx0Yb17cs3WYHbm&limit=5" \
  -H "X-N8N-API-Key: $N8N_API_KEY" | jq '.data[] | {id, status, startedAt}'
```

---

**Archivos modificados:**
- `workflows/seed_clean/WF2_Booking_Orchestrator_Worker.json`
- `docker-compose/docker-compose.yml` (ORCHESTRATOR_URL)
- `docs/FASE_4_ESTADO.md` (nuevo)
- `docs/CONNECTIVITY_REPORT.md` (nuevo)
- `docs/FASE_3_COMPLETADA.md` (nuevo)

