# 🐳 DOCKER CRON WORKER - IMPLEMENTACIÓN PRODUCCIÓN

**Fecha:** 2026-03-16  
**Estado:** ✅ IMPLEMENTADO  
**Basado en:** https://distr.sh/blog/docker-compose-cron-jobs/

---

## 📊 ARQUITECTURA

```
┌──────────────────────────────────────────────────────────────┐
│         booking-queue-worker (Alpine + Cron)                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  crond (foreground)                                    │ │
│  │  ├─ * * * * * → booking_queue_worker.ts (:00)          │ │
│  │  └─ * * * * * → booking_queue_worker.ts (:30)          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Volumes:                                                    │
│  - ./crontab:/etc/crontabs/root:ro                          │
│  - node_modules:/app/node_modules:ro                        │
│  - scripts-ts:/app/scripts-ts:ro                            │
└──────────────────────────────────────────────────────────────┘
           │
           │ Red Docker: n8n-network
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  n8n_titanium:5678                                           │
│  └─ Webhook: /booking-orchestrator                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔧 ARCHIVOS CREADOS

### 1. **Dockerfile.worker.cron**
**Ubicación:** `docker-compose/Dockerfile.worker.cron`

**Características:**
- Base: Alpine 3.23 (minimal, security)
- Node.js + npm para ejecutar TypeScript
- BusyBox cron (ligero, probado en producción)
- Cron en foreground (`-f` flag)
- Logging a stdout (`-L /dev/stdout`)
- Health check integrado
- Usuario no-root (security best practice)

```dockerfile
FROM alpine:3.23

RUN apk add --no-cache nodejs npm busybox-extras

WORKDIR /app
COPY ../package*.json ./
COPY ../scripts-ts ./scripts-ts
RUN npm install --ignore-scripts && npm cache clean --force

COPY crontab /etc/crontabs/root
RUN chmod 0600 /etc/crontabs/root

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD pgrep -x crond > /dev/null || exit 1

CMD ["busybox", "crond", "-f", "-L", "/dev/stdout", "-l", "8"]
```

---

### 2. **crontab**
**Ubicación:** `docker-compose/crontab`

**Configuración:**
- Environment variables declaradas explícitamente
- Ejecución cada 30 segundos (:00 y :30)
- Logging a stdout (visible via `docker logs`)
- Health check de DB cada 5 minutos
- Log rotation diario

```crontab
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/app/node_modules/.bin
NODE_ENV=production
LOG_LEVEL=info

# WORKER - Cada 30 segundos
* * * * * cd /app && npx tsx scripts-ts/booking_queue_worker.ts >> /dev/stdout 2>&1
* * * * * sleep 30 && cd /app && npx tsx scripts-ts/booking_queue_worker.ts >> /dev/stdout 2>&1

# HEALTH CHECK - Cada 5 minutos
*/5 * * * * psql -h postgres -U n8n_user -d n8n_db_titanium -c "SELECT 1" > /dev/null 2>&1 || echo "DB health check failed" >> /dev/stderr

# LOG ROTATION - Diario
0 0 * * * find /var/log -name "*.log" -mtime +7 -delete 2>/dev/null
```

---

### 3. **docker-compose.yml (actualizado)**
**Servicio:** `booking-queue-worker`

**Configuración clave:**
- Build context: `docker-compose/`
- Dockerfile: `Dockerfile.worker.cron`
- Volúmenes: crontab, node_modules, scripts-ts
- Red: `n8n-network` (misma que n8n_titanium)
- Health check: `pgrep -x crond`
- Logging: json-file con rotación (10m, 3 files)

```yaml
booking-queue-worker:
  build:
    context: ./docker-compose
    dockerfile: Dockerfile.worker.cron
  container_name: booking_queue_worker
  restart: unless-stopped
  
  environment:
    - DATABASE_URL=postgres://...
    - ORCHESTRATOR_URL=http://n8n_titanium:5678/webhook/booking-orchestrator
    - WORKER_BATCH_SIZE=5
    - WORKER_MAX_CONCURRENT=3
  
  volumes:
    - ./crontab:/etc/crontabs/root:ro
    - ../node_modules:/app/node_modules:ro
    - ../scripts-ts:/app/scripts-ts:ro
  
  networks:
    - n8n-network
  
  healthcheck:
    test: ["CMD", "pgrep", "-x", "crond"]
    interval: 30s
    timeout: 10s
    retries: 3
  
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
```

---

## 🚀 DESPLIEGUE

### Build inicial
```bash
cd /home/manager/Sync/N8N_Projects/booking-titanium/docker-compose
docker-compose build booking-queue-worker
```

### Start
```bash
docker-compose up -d booking-queue-worker
```

### Ver logs
```bash
# Logs en tiempo real
docker-compose logs -f booking-queue-worker

# Últimas 50 líneas
docker-compose logs --tail=50 booking-queue-worker

# Logs de hoy
docker logs booking_queue_worker --since 2026-03-16
```

### Ver estado
```bash
# Estado del container
docker-compose ps booking-queue-worker

# Health check
docker inspect booking_queue_worker --format='{{.State.Health.Status}}'

# Ver cron corriendo
docker exec booking_queue_worker pgrep -x crond
```

---

## 🔍 MONITOREO

### Ver crontab activo
```bash
docker exec booking_queue_worker cat /etc/crontabs/root
```

### Ver trabajos programados
```bash
docker exec booking_queue_worker crontab -l
```

### Ver logs de cron
```bash
docker logs booking_queue_worker 2>&1 | grep -i "cron\|worker\|processing"
```

### Ver intents procesados
```bash
# En la DB
PGPASSWORD=npg_qxXSa8VnUo0i psql -h ep-small-bread-aijl410v-pooler.c-4.us-east-1.aws.neon.tech \
  -U neondb_owner -d neondb \
  -c "SELECT status, COUNT(*), MAX(updated_at) as last_update FROM booking_intents GROUP BY status;"
```

### Ver ejecuciones de WF2
```bash
curl -s "https://n8n.stax.ink/api/v1/executions?workflowId=Z7g7DgxXQ61V368P&limit=10" \
  -H "X-N8N-API-Key: $N8N_API_KEY" | jq '.data[] | {id, status, startedAt, mode}'
```

---

## 🛠️ MANTENIMIENTO

### Actualizar schedule (sin rebuild)
```bash
# 1. Editar crontab local
vim docker-compose/crontab

# 2. Reiniciar container (recarga crontab)
docker-compose restart booking-queue-worker

# 3. Verificar nuevo schedule
docker exec booking_queue_worker crontab -l
```

### Actualizar scripts (sin rebuild)
```bash
# Los scripts-ts están montados como volumen
# Cambios se reflejan inmediatamente

# Verificar que el container ve los cambios
docker exec booking_queue_worker ls -la /app/scripts-ts/
```

### Actualizar node_modules (requiere rebuild)
```bash
# 1. Actualizar en host
cd /home/manager/Sync/N8N_Projects/booking-titanium
npm install

# 2. Reiniciar container
docker-compose restart booking-queue-worker
```

### Limpieza de logs
```bash
# Manual
docker logs booking_queue_worker --tail=100 > /tmp/worker.log

# Automático (ya configurado en crontab)
# 0 0 * * * find /var/log -name "*.log" -mtime +7 -delete
```

---

## 🐛 TROUBLESHOOTING

### Cron no está corriendo
```bash
# Verificar proceso
docker exec booking_queue_worker pgrep -x crond

# Si no hay output, cron no está corriendo
# Reiniciar container
docker-compose restart booking-queue-worker
```

### Jobs no se ejecutan
```bash
# Verificar crontab
docker exec booking_queue_worker crontab -l

# Verificar permisos
docker exec booking_queue_worker ls -la /etc/crontabs/root
# Debe ser: -rw------- (0600)

# Ver logs de cron
docker logs booking_queue_worker 2>&1 | grep -i "cron"
```

### Worker falla con error de DB
```bash
# Verificar conexión DB
docker exec booking_queue_worker psql -h postgres -U n8n_user -d n8n_db_titanium -c "SELECT 1"

# Verificar environment variables
docker exec booking_queue_worker env | grep DATABASE
```

### Worker falla con error de red
```bash
# Verificar conectividad con n8n
docker exec booking_queue_worker wget -q -O- http://n8n_titanium:5678/healthz

# Verificar red Docker
docker network inspect docker-compose_n8n-network --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{end}}'
```

---

## 📊 BEST PRACTICES APLICADAS

| Best Practice | Implementación |
|---------------|----------------|
| **Minimal base image** | Alpine 3.23 |
| **Non-root user** | nodejs:nodejs (1001:1001) |
| **Foreground process** | `crond -f` |
| **Logging a stdout** | `crond -L /dev/stdout` |
| **Health checks** | `pgrep -x crond` cada 30s |
| **Resource limits** | Logging: 10m max, 3 files |
| **Volume mounts** | crontab, node_modules, scripts-ts |
| **Network isolation** | n8n-network (same as n8n) |
| **Environment variables** | Declaradas en crontab |
| **Schedule distribution** | :00 y :30 (evita picos en :00) |

---

## 📈 MÉTRICAS ESPERADAS

| Métrica | Target | Cómo medir |
|---------|--------|------------|
| Cron ejecuciones/min | 2 | `docker logs booking_queue_worker \| grep -c "Processing"` |
| Worker success rate | >95% | `SELECT status, COUNT(*) FROM booking_intents GROUP BY status` |
| Intent processing time | <30s | Logs del worker |
| Health check failures | 0 | `docker inspect booking_queue_worker --format='{{.State.Health.Status}}'` |
| Container restarts | 0 | `docker inspect booking_queue_worker --format='{{.RestartCount}}'` |

---

## 🔐 SEGURIDAD

- ✅ **Sin Docker socket access** - No puede controlar otros containers
- ✅ **Usuario no-root** - nodejs (UID 1001)
- ✅ **Volúmenes read-only** - crontab, node_modules, scripts-ts montados como `:ro`
- ✅ **Minimal packages** - Solo nodejs, npm, busybox-extras
- ✅ **Crontab permissions** - 0600 (solo root lee/escribe)
- ✅ **Network isolation** - Solo red n8n-network, sin puertos expuestos

---

## 📝 REFERENCIAS

- [Docker Compose Cron Jobs Guide](https://distr.sh/blog/docker-compose-cron-jobs/)
- [Alpine Docker Image](https://hub.docker.com/_/alpine)
- [BusyBox Cron](https://wiki.musl-libc.org/cron.html)
- [n8n Queue Mode Documentation](https://docs.n8n.io/hosting/scaling/queue-mode/)

---

**Archivos relacionados:**
- `docker-compose/Dockerfile.worker.cron`
- `docker-compose/crontab`
- `docker-compose/docker-compose.yml`
- `scripts-ts/booking_queue_worker.ts`
- `docs/WF8_CRON_FIX.md`
