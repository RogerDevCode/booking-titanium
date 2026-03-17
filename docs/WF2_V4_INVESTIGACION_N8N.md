# 🔍 WF2 v4.0 - INVESTIGACIÓN COMUNIDAD N8N

**Fecha:** 2026-03-17  
**Objetivo:** Documentar bugs conocidos y condiciones bloqueantes antes de crear WF2 v4.0

---

## 📊 BUGS CONOCIDOS QUEUE MODE

### 1. **Sub-Workflows en Queue Mode Mostrando Fallo** ⚠️ CRÍTICO

**GitHub Issue:** [#25531](https://github.com/n8n-io/n8n/issues/25531)  
**Estado:** Abierto  
**n8n Versión:** 2.6.3

#### Síntomas
- Sub-workflows en queue mode muestran **"Failed"** pero están **esperando procesamiento**
- Canvas muestra **"Error"** en lugar de **"Queued"**
- **No hay `runData`** asociado a la ejecución
- Estado puede cambiar espontáneamente de **Error → Succeeded**

#### Condiciones de Reproducción
- Usar **queue mode**
- Ejecutar **múltiples jobs** con **sub-workflows**
- Sub-workflows se ejecutan en el **mismo worker** que el workflow padre

#### Impacto en WF2 Actual
```
WF2 (queue mode) → HTTP Request → WF7 (Lock)
                 → HTTP Request → CB_01 (Circuit Breaker)
                 → HTTP Request → WF3 (Availability)
```

**Resultado:** WF2 muestra `runData: null` y status `error` aunque los sub-workflows se ejecuten correctamente.

---

### 2. **Queue Mode Reliability Peor en v2.x** ⚠️ CRÍTICO

**Community Thread:** [247235](https://community.n8n.io/t/after-upgrading-n8n-self-hosted-to-v2-x-queue-mode-reliability-much-worse/247235)  
**Fecha:** Enero 2026

#### Error Principal
```
Error: This execution failed to be processed too many times and will no longer retry.
To allow this execution to complete, please break down your workflow or scale up your 
workers or adjust your worker settings.
```

#### Estadísticas
- **v1.x:** 1-2% error rate
- **v2.x:** 5-20% error rate

#### Causa Raíz
- **Breaking Change:** Remoción de `QUEUE_WORKER_MAX_STALLED_COUNT` en v2.0
- Cambio fundamental en lógica de retry de queue

#### Workarounds (Parciales)
```bash
# En main y worker instances
QUEUE_WORKER_LOCK_DURATION=3600000        # 60 min
QUEUE_WORKER_LOCK_RENEW_TIME=120000       # 2 min
QUEUE_WORKER_STALLED_INTERVAL=240000      # 4 min

# Memoria y payload
NODE_OPTIONS=--max-old-space-size=4096
N8N_PAYLOAD_SIZE_MAX=134217728            # 128MB
```

**Nota:** Estos workarounds **reducen frecuencia** pero **NO eliminan** el problema.

---

### 3. **Worker Distribution Issue con Sub-Workflows** ⚠️ IMPORTANTE

**Community:** Execute Workflow vs Webhook Trigger  
**Fecha:** Febrero 2026

#### Problema
Cuando un workflow tiene sub-workflows varios niveles profundos:
- **Primer worker** que toma la ejecución **procesa TODO** hasta finalizar
- Sub-workflows en diferentes niveles **NO se distribuyen** entre múltiples workers
- **Un worker** obtiene casi toda la carga, otros permanecen **ociosos**

#### Impacto
```
WF2 → WF7 → WF3 → CB_01 (todos en el mismo worker)
```

**Resultado:** 
- ❌ Distribución de carga desigual
- ❌ Sin paralelismo real
- ❌ Cuello de botella en un solo worker

---

### 4. **Execute Workflow vs Webhook Trigger**

| Aspecto | Execute Workflow Node | Webhook Trigger (HTTP Request) |
|---------|----------------------|-------------------------------|
| **Ejecución** | Síncrona, mismo contexto | Asíncrona, ejecución independiente |
| **Paralelismo** | Secuencial (incluso con Split Out) | Paralelo (cada webhook = nueva ejecución) |
| **Bloqueo** | Padre espera a cada sub-workflow | Padre no bloquea (a menos que espere HTTP response) |
| **Worker Assignment** | **Mismo worker** maneja toda la cadena | **Diferentes workers** pueden tomar cada ejecución |
| **Queue Mode** | ❌ Problemas de distribución | ✅ Mejor distribución pero bug runData null |

---

## 🚨 CONDICIONES BLOQUEANTES IDENTIFICADAS

### 1. **NO usar HTTP Request a sub-workflows en queue mode** ❌

**Condición:**
```
WF2 (queue mode) → HTTP Request → Sub-Workflow
```

**Problema:**
- runData null
- Error sin mensaje
- Estado incorrecto (Error vs Queued)

**Workaround:**
- ✅ **Todo interno** (sin HTTP Request)
- ✅ **Execute Workflow node** (pero mismo worker)
- ✅ **Worker procesa directo** (sin WF2)

---

### 2. **NO usar WF2 para worker async** ❌

**Condición:**
```
Worker → HTTP Request → WF2 (queue mode)
```

**Problema:**
- Mismo bug de runData null
- WF2 funciona para WF1 (sync) ✅
- WF2 falla para worker (async) ❌

**Workaround:**
- ✅ Worker procesa directo (sin pasar por WF2)
- ✅ WF1 → WF2 (sync) funciona 100%

---

### 3. **NO anidar sub-workflows 3+ niveles** ❌

**Condición:**
```
WF2 → WF7 → WF3 → CB_01
```

**Problema:**
- Mismo worker procesa todo
- Sin distribución de carga
- Posible timeout en cadena

**Recomendación:**
- ✅ Máximo 2 niveles de anidación
- ✅ Todo interno en WF2 (sin sub-workflows)

---

### 4. **NO usar Execute Workflow para paralelismo** ❌

**Condición:**
```
WF2 → Split Out → Execute Workflow (por item)
```

**Problema:**
- Procesamiento secuencial (no paralelo)
- Sin mejora de throughput
- Mismo worker para todo

**Recomendación:**
- ✅ Webhook Trigger + HTTP Request para paralelismo real
- ✅ Wait node + callback para reunir resultados

---

## 📈 MEJORES PRÁCTICAS IDENTIFICADAS

### 1. **Workflow Design para Queue Mode**

✅ **HACER:**
- Workflows pequeños y enfocados (<30 nodos)
- Todo interno (sin HTTP Request a sub-workflows)
- Validación PRE, DURING, POST
- Standard Contract Output
- onError paths configurados

❌ **NO HACER:**
- Workflows grandes (>50 nodos)
- HTTP Request a sub-workflows
- Anidación 3+ niveles
- Sin error handling

---

### 2. **Worker Configuration**

✅ **RECOMENDADO:**
```bash
# Worker settings
QUEUE_WORKER_CONCURRENCY=5           # Mínimo 5
QUEUE_WORKER_LOCK_DURATION=3600000   # 60 min
QUEUE_WORKER_LOCK_RENEW_TIME=120000  # 2 min
QUEUE_WORKER_STALLED_INTERVAL=240000 # 4 min

# Memoria
NODE_OPTIONS=--max-old-space-size=4096
N8N_PAYLOAD_SIZE_MAX=134217728       # 128MB
```

❌ **EVITAR:**
```bash
QUEUE_WORKER_CONCURRENCY=1           # Muy bajo
QUEUE_WORKER_LOCK_DURATION=180000    # Muy corto
```

---

### 3. **HTTP Request vs Execute Workflow**

| Caso de Uso | Recomendación |
|-------------|---------------|
| **Necesita respuesta inmediata** | Execute Workflow (síncrono) |
| **Fan-out paralelo** | Webhook Trigger + HTTP Request |
| **Reutilizar lógica** | Execute Workflow |
| **Queue mode** | ⚠️ Evitar ambos, usar todo interno |

---

### 4. **Error Handling en Queue Mode**

✅ **PATRÓN RECOMENDADO:**
```
Workflow → Logic → onError → DLQ
                   ↓
              Rollback (si es necesario)
                   ↓
              Standard Contract Output
```

**Configuración:**
- `onError: continueErrorOutput` en nodos críticos
- DLQ para retry posterior
- Rollback para cleanup
- Standard Contract para consistencia

---

## 🎯 RECOMENDACIONES PARA WF2 v4.0

### Arquitectura Recomendada

```
┌─────────────────────────────────────────────────────────────┐
│  WF2_v4_BOOKING_ORCHESTRATOR (TODO INTERNO)                 │
│                                                              │
│  Webhook → Validate → Check Idempotency (DB directo)        │
│              ↓                                               │
│  Is Duplicate? → Return existing (si existe)                │
│              ↓                                               │
│  Acquire Lock (DB directo, sin WF7)                         │
│              ↓                                               │
│  Check Availability (DB directo, sin WF3)                   │
│              ↓                                               │
│  Check Circuit Breaker (DB directo, sin CB_01)              │
│              ↓                                               │
│  Create GCal Event (API directa)                            │
│              ↓                                               │
│  Record Circuit Breaker Success (DB directo)                │
│              ↓                                               │
│  Create Booking (DB directo)                                │
│              ↓                                               │
│  Release Lock (DB directo)                                  │
│              ↓                                               │
│  Response Standard Contract                                 │
└─────────────────────────────────────────────────────────────┘
```

**Ventajas:**
- ✅ Sin HTTP Request → Sin bug de queue mode
- ✅ Sin sub-workflows → Sin distribución incorrecta
- ✅ Todo en mismo contexto → runData disponible
- ✅ Más rápido (sin overhead de red)
- ✅ Más simple (~25 nodos vs 37)

---

## 📋 CHECKLIST WF2 v4.0

### Antes de Crear
- [ ] Leer GEMINI.md §3.7 (Node versions)
- [ ] Leer GEMINI.md §5 (Known bugs)
- [ ] Verificar workflow_activation_order.json
- [ ] Planear nodos internos (sin HTTP Request)

### Durante Creación
- [ ] Máximo 25-30 nodos
- [ ] Todo interno (Postgres, GCal API directo)
- [ ] Standard Contract Output en todos los paths
- [ ] onError paths configurados
- [ ] Node versions correctas (Code v2, IF v2.3, etc.)

### Después de Crear
- [ ] Validar con workflow_validator.ts --fix
- [ ] Subir con n8n_crud_agent.ts
- [ ] Activar workflow
- [ ] Test manual (no queue mode primero)
- [ ] Tests automáticos (Jest)
- [ ] Test queue mode (verificar runData)

---

## 🔍 MONITOREO POST-DEPLOY

### Métricas a Verificar
| Métrica | Target | Cómo Medir |
|---------|--------|------------|
| runData null | 0% | API n8n: `/executions/{id}` |
| Error rate | <5% | API n8n: `/executions?status=error` |
| Execution time | <30s | Logs de workflow |
| Worker distribution | Balanceada | Logs de worker |

### Comandos de Verificación
```bash
# Verificar runData
curl https://n8n.stax.ink/api/v1/executions/{id} \
  -H "X-N8N-API-Key: $KEY" | jq .data.resultData.runData

# Verificar error rate
curl https://n8n.stax.ink/api/v1/executions?workflowId={id}&status=error \
  -H "X-N8N-API-Key: $KEY" | jq '.data | length'

# Ver logs de worker
docker logs n8n_worker_1 --tail 100 | grep -i "WF2"
```

---

## 📝 REFERENCIAS

### GitHub Issues
- [#25531](https://github.com/n8n-io/n8n/issues/25531) - Sub-workflow queue mode failures
- [#17395](https://github.com/n8n-io/n8n/issues/17395) - Queue mode Redis bug

### Community Threads
- [247235](https://community.n8n.io/t/after-upgrading-n8n-self-hosted-to-v2-x-queue-mode-reliability-much-worse/247235) - Queue mode reliability
- [259590](https://community.n8n.io/t/execute-workflow-vs-webhook-trigger/259590) - Execute Workflow vs Webhook

### Documentación Oficial
- [n8n Queue Mode Docs](https://docs.n8n.io/hosting/scaling/queue-mode/)
- [n8n Best Practices](https://docs.n8n.io/best-practices/)

---

**Estado:** ✅ INVESTIGACIÓN COMPLETADA  
**Próximo paso:** Crear WF2 v4.0 (todo interno, sin HTTP Request)  
**Fecha estimada:** 2026-03-17
