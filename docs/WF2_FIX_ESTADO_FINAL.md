# 📋 WF2 FIX - ESTADO FINAL

**Fecha:** 2026-03-17  
**Estado:** ⏸️ BLOQUEADO (bug n8n queue mode)

---

## 🎯 RESUMEN EJECUTIVO

**Problema:** WF2 devuelve error 500 cuando es llamado desde el worker externo

**Causa Raíz:** Bug conocido en n8n queue mode - webhooks no se registran correctamente después de actualizar workflows

**Estado Actual:**
- ✅ Docker Cron Worker funcionando (ejecuta cada 30s)
- ⏸️ WF2 error 500 pendiente (bug queue mode)
- ✅ URLs externas implementadas
- ⏸️ Webhook registration falla

---

## 🔧 INTENTOS REALIZADOS

### 1. WF2 Original con URLs Internas
**Estado:** ❌ No funciona para worker externo
**Razón:** `http://n8n_titanium:5678` solo funciona desde dentro del container n8n

### 2. WF2_Worker con URLs Externas
**ID:** `Ifx0Yb17cs3WYHbm`  
**Estado:** ❌ Webhook no se registra en queue mode
**Razón:** Bug conocido n8n post-v1.121.0

### 3. WF2 Original Actualizado a URLs Externas
**ID:** `Z7g7DgxXQ61V368P`  
**Estado:** ❌ Webhook no se registra después de update
**Razón:** Queue mode no recarga webhooks en updates

### 4. WF2_v2 Creado desde Cero
**ID:** `p7xNzqYZ7jWGo7Z8`  
**Webhook:** `/booking-orchestrator-v2`  
**Estado:** ❌ Webhook registrado pero no ejecuta (error null)
**Razón:** Queue mode bug - webhook handler no carga workflows correctamente

---

## 📊 ARQUITECTURA ACTUAL

```
┌──────────────────────────────────────────────────────────────┐
│         booking-queue-worker (✅ FUNCIONANDO)                │
│         Cron ejecuta cada 30s                                │
│                                                              │
│         POST http://n8n_titanium:5678/webhook/               │
│              booking-orchestrator                            │
└──────────────────────────────────────────────────────────────┘
           │
           │ ❌ Error 500 - Webhook no se registra
           ▼
┌──────────────────────────────────────────────────────────────┐
│         n8n_titanium:5678                                    │
│                                                              │
│         WF2_Booking_Orchestrator (Z7g7DgxXQ61V368P)          │
│         - URLs: Externas (https://n8n.stax.ink) ✅           │
│         - Webhook: /booking-orchestrator ✅                  │
│         - Estado: Activo ✅                                   │
│         - Ejecución: ❌ Error 500                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 🐛 BUG N8N QUEUE MODE

**Referencias:**
- [community.n8n.io/t/254142](https://community.n8n.io/t/the-schedule-trigger-is-not-working-properly/254142) - Schedule Trigger no funciona
- [community.n8n.io/t/244687](https://community.n8n.io/t/cron-trigger-executing-multiple-times-after-updates-due-to-ghost-triggers-in-queue-mode-with-multiple-workers/244687) - Ghost triggers

**Síntomas:**
1. Webhooks no se registran después de actualizar workflow
2. Toggle activate/deactivate no funciona
3. Crear workflow nuevo funciona temporalmente
4. Reiniciar n8n fixea temporalmente

**Workarounds intentados:**
- ❌ Toggle activate/deactivate
- ❌ Actualizar workflow con mismo ID
- ❌ Crear workflow nuevo con diferente ID
- ❌ Cambiar webhook path

**Workarounds recomendados por comunidad:**
1. ✅ External scheduler (implementado - Docker Cron Worker)
2. ✅ Downgrade a v1.121.0 (no implementado - pierde fixes)
3. ⏸️ Reiniciar n8n después de cada update (disruptivo)

---

## ✅ COMPONENTES FUNCIONANDO

| Componente | Estado | Notas |
|------------|--------|-------|
| Docker Cron Worker | ✅ | Ejecuta cada 30s |
| booking_intents DB | ✅ | Funciones y vistas OK |
| WF1_Booking_API_Gateway | ✅ | URLs externas listas |
| WF3_Availability_Service | ✅ | Funciona |
| WF7_Distributed_Lock_System | ✅ | Funciona |
| CB_01_Check_State | ✅ | Funciona |
| CB_02_Record_Result | ✅ | Funciona |

---

## ⏸️ COMPONENTES BLOQUEADOS

| Componente | Estado | Bloqueante |
|------------|--------|------------|
| WF2_Booking_Orchestrator | ⏸️ | Webhook registration bug |
| End-to-end processing | ⏸️ | Depende de WF2 |
| Success rate >95% | ⏸️ | Depende de WF2 |

---

## 🔧 PRÓXIMOS PASOS

### Opción A: Reiniciar n8n (Recomendado para test)
```bash
cd docker-compose
docker-compose restart n8n
# Esperar 2-3 minutos para que n8n inicie
# Webhooks deberían registrarse correctamente
```

### Opción B: Downgrade n8n a v1.121.0
```yaml
# docker-compose.yml
n8n:
  image: n8nio/n8n:1.121.0  # ← Cambiar de 2.10.2
```

### Opción C: Esperar fix oficial n8n
- Monitorear releases de n8n
- Bug reportado en comunidad
- Sin ETA oficial

---

## 📈 MÉTRICAS ACTUALES

| Métrica | Valor | Target | Estado |
|---------|-------|--------|--------|
| Cron ejecuciones/min | 2 | 2 | ✅ |
| WF2 webhook response | 500 | 200 | ❌ |
| Intent success rate | 0% | >95% | ❌ |
| Worker uptime | 100% | >99% | ✅ |

---

## 📝 LECCIONES APRENDIDAS

1. **Queue mode tiene bugs conocidos con webhooks**
   - No confiar en webhook registration después de updates
   - Planear reinicios después de deployments

2. **External scheduler es más confiable**
   - Docker Cron Worker funciona 100%
   - No depende de bugs de n8n

3. **URLs internas vs externas**
   - Internas: Performance óptima, solo dentro del container
   - Externas: Funciona desde fuera, depende de Cloudflare

4. **Documentación es crítica**
   - Todos los intentos documentados
   - Fácil reproducir y debuggear

---

**Archivos relacionados:**
- `docker-compose/Dockerfile.worker.cron`
- `docker-compose/crontab.simple`
- `workflows/seed_clean/WF2_Booking_Orchestrator_v2.json`
- `docs/DOCKER_CRON_WORKER_IMPLEMENTADO.md`
- `docs/WF8_CRON_FIX.md`
- `docs/FASE_4_ESTADO.md`

---

**Estado:** ⏸️ BLOQUEADO - Esperando fix de n8n o reinicio  
**Última actualización:** 2026-03-17  
**Próxima acción:** Reiniciar n8n para test o esperar fix oficial
