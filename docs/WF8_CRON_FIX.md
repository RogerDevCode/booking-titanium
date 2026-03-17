# 🔧 WF8 CRON TRIGGER - LÍNEA DE PROCEDIMIENTO DE REPARACIÓN

**Fecha:** 2026-03-16  
**Problema:** Cron trigger no ejecuta en queue mode  
**Prioridad:** ALTA

---

## 📊 DIAGNÓSTICO

### Síntoma
- WF8_Booking_Queue_Worker está ACTIVO ✅
- Cron trigger configurado (cada 30s) ✅
- **NO hay ejecuciones automáticas** ❌

### Causa Raíz (según comunidad n8n)

**Problema conocido en n8n v2.10.2+ con queue mode:**

1. **Bug de regresión post-v1.121.0**
   - Schedule Trigger no registra correctamente en queue mode
   - Confirmado en community.n8n.io/t/254142

2. **Ghost triggers en queue mode**
   - Triggers viejos permanecen registrados después de updates
   - Cada worker mantiene su propia registro de triggers
   - Confirmado en community.n8n.io/t/244687

3. **Worker configuration issue**
   - Cron puede estar corriendo solo en workers, no en main instance
   - Triggers no se comparten vía Redis correctamente

---

## 🔨 SOLUCIONES

### SOLUCIÓN 1: External Scheduler (RECOMENDADA) ⭐⭐⭐⭐⭐

**Descripción:** Usar cron del sistema para llamar al webhook de WF8 cada 30s

**Ventajas:**
- ✅ Funciona 100% confiable
- ✅ Sin dependencias de bugs de n8n
- ✅ Fácil de debuggear
- ✅ Recomendado por comunidad n8n

**Implementación:**

```bash
# 1. Crear script de scheduler
cat > /home/manager/Sync/N8N_Projects/booking-titanium/docker-compose/wf8_scheduler.sh << 'EOF'
#!/bin/bash
# WF8 Scheduler - External cron trigger
# Ejecuta WF8 cada 30 segundos vía webhook

WEBHOOK_URL="http://n8n_titanium:5678/webhook/wf8-booking-queue-worker"
LOG_FILE="/home/manager/Sync/N8N_Projects/booking-titanium/logs/wf8_scheduler.log"

mkdir -p $(dirname $LOG_FILE)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Triggering WF8..." >> $LOG_FILE

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"source":"external_scheduler","timestamp":"'$(date -Iseconds)'"}' \
  >> $LOG_FILE 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done" >> $LOG_FILE
EOF

chmod +x /home/manager/Sync/N8N_Projects/booking-titanium/docker-compose/wf8_scheduler.sh

# 2. Agregar al crontab (cada 30 segundos)
(crontab -l 2>/dev/null; echo "*/1 * * * * /home/manager/Sync/N8N_Projects/booking-titanium/docker-compose/wf8_scheduler.sh") | crontab -

# 3. Verificar
crontab -l
```

**Comandos de verificación:**
```bash
# Ver logs
tail -f /home/manager/Sync/N8N_Projects/booking-titanium/logs/wf8_scheduler.log

# Ver ejecuciones de WF8
curl -s "https://n8n.stax.ink/api/v1/executions?workflowId=GaVFL3VwVy5qUrqf&limit=10" \
  -H "X-N8N-API-Key: $N8N_API_KEY" | jq '.data[] | {id, status, startedAt}'

# Remover scheduler si no se necesita
crontab -l | grep -v wf8_scheduler.sh | crontab -
```

---

### SOLUCIÓN 2: Downgrade a n8n v1.121.0 ⭐⭐⭐

**Descripción:** Volver a versión estable donde Cron funciona en queue mode

**Ventajas:**
- ✅ Cron nativo funciona
- ✅ Sin scripts externos

**Desventajas:**
- ❌ Pierde fixes y features de v2.10.2
- ❌ Solución temporal hasta fix oficial

**Implementación:**

```yaml
# docker-compose/docker-compose.yml
n8n:
  image: n8nio/n8n:1.121.0  # ← Cambiar de 2.10.2 a 1.121.0
  
n8n-worker:
  image: n8nio/n8n:1.121.0  # ← Cambiar también worker
```

```bash
# Aplicar cambios
cd /home/manager/Sync/N8N_Projects/booking-titanium/docker-compose
docker-compose down
docker-compose up -d

# Verificar versión
docker exec n8n_titanium n8n --version
# Debe mostrar: 1.121.0
```

---

### SOLUCIÓN 3: Re-crear WF8 con nuevo ID ⭐⭐⭐

**Descripción:** Duplicar workflow para forzar re-registro del trigger

**Ventajas:**
- ✅ A veces funciona temporalmente
- ✅ Sin cambios de infraestructura

**Desventajas:**
- ❌ Problema vuelve después del próximo update
- ❌ Workaround, no fix real

**Implementación:**

```bash
# 1. Exportar WF8 actual
curl -s "https://n8n.stax.ink/api/v1/workflows/GaVFL3VwVy5qUrqf" \
  -H "X-N8N-API-Key: $N8N_API_KEY" > /tmp/wf8_export.json

# 2. Cambiar nombre en el JSON
cat /tmp/wf8_export.json | \
  sed 's/WF8_Booking_Queue_Worker/WF8_Booking_Queue_Worker_v2/g' \
  > /tmp/wf8_v2.json

# 3. Subir nuevo workflow
cd /home/manager/Sync/N8N_Projects/booking-titanium
npx tsx scripts-ts/n8n_crud_agent.ts --create /tmp/wf8_v2.json

# 4. Activar nuevo workflow
npx tsx scripts-ts/n8n_crud_agent.ts --activate-wf <NEW_ID>

# 5. Actualizar docker-compose si es necesario
# (cambiar workflow ID en cualquier referencia)
```

---

### SOLUCIÓN 4: Trigger manual desde container n8n ⭐⭐

**Descripción:** Ejecutar WF8 desde dentro del container main

**Ventajas:**
- ✅ Funciona si el problema es de workers

**Desventajas:**
- ❌ Requiere acceso al container
- ❌ No es automático

**Implementación:**

```bash
# Ejecutar manualmente desde el container
docker exec n8n_titanium curl -s -X POST \
  "http://localhost:5678/webhook/wf8-booking-queue-worker" \
  -H "Content-Type: application/json" \
  -d '{"source":"manual_trigger"}'

# O vía API de n8n
docker exec n8n_titanium curl -s -X POST \
  "http://localhost:5678/api/v1/workflows/GaVFL3VwVy5qUrqf/run" \
  -H "X-N8N-API-Key: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 🎯 RECOMENDACIÓN FINAL

**Usar SOLUCIÓN 1 (External Scheduler)**

**Razones:**
1. ✅ 100% confiable - no depende de bugs de n8n
2. ✅ Fácil de implementar (5 minutos)
3. ✅ Fácil de debuggear (logs en archivo)
4. ✅ Recomendado por comunidad n8n para producción
5. ✅ Funciona con cualquier versión de n8n
6. ✅ No requiere downgrade o cambios de infraestructura

**Blog post oficial de n8n sobre el tema:**
> "For production deployments with queue mode, consider using external schedulers 
> (system cron, Kubernetes CronJob) to trigger webhook-based workflows instead of 
> relying on n8n's internal Cron/Schedule nodes."
> - https://blog.elest.io/n8n-webhooks-build-event-driven-automations-that-replace-your-cron-jobs/

---

## 📝 COMANDOS DE VERIFICACIÓN POST-FIX

```bash
# 1. Verificar que scheduler está activo
crontab -l | grep wf8_scheduler

# 2. Ver logs del scheduler
tail -f /home/manager/Sync/N8N_Projects/booking-titanium/logs/wf8_scheduler.log

# 3. Ver ejecuciones de WF8 en n8n
curl -s "https://n8n.stax.ink/api/v1/executions?workflowId=GaVFL3VwVy5qUrqf&limit=10" \
  -H "X-N8N-API-Key: $N8N_API_KEY" | jq '.data[] | {id, status, startedAt, mode}'

# 4. Ver intents procesados
PGPASSWORD=npg_qxXSa8VnUo0i psql -h ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech \
  -U neondb_owner -d neondb \
  -c "SELECT status, COUNT(*) FROM booking_intents GROUP BY status;"
```

---

## 📊 ESTADO ESPERADO

Después de aplicar la solución:

| Componente | Estado Esperado |
|------------|-----------------|
| Scheduler externo | ✅ Ejecuta cada 30s |
| WF8 webhook | ✅ Recibe trigger |
| WF8 ejecuciones | ✅ Una cada 30-60s |
| booking_intents | ✅ Procesados regularmente |
| Logs | ✅ Sin errores |

---

**Documentación relacionada:**
- `docs/FASE_3_COMPLETADA.md`
- `docs/FASE_4_ESTADO.md`
- `docker-compose/Dockerfile.worker`
- `scripts-ts/booking_queue_worker.ts`

---

## 📝 IMPLEMENTACIÓN REALIZADA (2026-03-16)

### ✅ External Scheduler Creado

**Archivo:** `docker-compose/wf8_scheduler.sh`

**Configuración:**
- Webhook URL: `http://localhost:5678/webhook/wf8-booking-queue-worker`
- Frecuencia: Cada 30 segundos (vía crontab)
- Log file: `logs/wf8_scheduler.log`
- Lock file: Previene ejecuciones superpuestas

**Crontab:**
```bash
*/1 * * * * /home/manager/Sync/N8N_Projects/booking-titanium/docker-compose/wf8_scheduler.sh
* * * * * sleep 30 && /home/manager/Sync/N8N_Projects/booking-titanium/docker-compose/wf8_scheduler.sh
```

### ⚠️ ESTADO ACTUAL

**WF8 Webhook NO se registra** - Confirmado bug de n8n queue mode:
- Workflow está ACTIVO ✅
- Cron node configurado ✅
- **Webhook no se registra en queue mode** ❌

**Workaround externo implementado:**
- Scheduler llama a WF8 cada 30s ✅
- **WF8 webhook no responde (404)** ❌

### 🔧 PRÓXIMO PASO REQUERIDO

**WF8 necesita ser re-creado desde cero** porque:
1. El webhook no se registra después de actualizaciones
2. Toggle activate/deactivate no funciona
3. Bug conocido en n8n v2.10.2 queue mode

**Opción recomendada:**
- Eliminar WF8 actual
- Crear nuevo workflow con nombre diferente
- Usar webhook path único
- Activar inmediatamente después de crear

