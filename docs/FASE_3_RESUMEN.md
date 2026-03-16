# 📋 FASE 3: ARQUITECTURA ASÍNCRONA - RESUMEN EJECUTIVO

**Fecha:** 2026-03-16  
**Estado:** ⏸️ PAUSADA (dependencias técnicas)

---

## ✅ LOGROS

1. **WF1_Booking_API_Gateway_Async** ✅
   - ID: `T3peNeEvQz2HFtxr`
   - Webhook: `POST /webhook/book-appointment-async`
   - Respuesta ACK en <1s
   - Inserta intents en booking_intents

2. **Tabla booking_intents** ✅
   - Funciones utilitarias creadas
   - Vistas de monitoreo activas
   - Trigger de updated_at funcionando

3. **Worker Externo** ✅
   - Script: `scripts-ts/booking_queue_worker.ts`
   - Rate limiting configurado
   - Retry logic implementado

---

## ⚠️ BLOQUEANTES TÉCNICOS

### 1. WF8 Cron Trigger no ejecuta
**Problema:** Cron node en n8n v2.10.2 queue mode no dispara automáticamente.

**Impacto:** WF8 no procesa intents de booking_intents.

**Workaround intentado:** Worker externo (script TypeScript)
- ✅ Funciona para obtener intents de DB
- ❌ No puede llamar a WF2 (URLs internas vs externas)

### 2. WF2 URLs Internas vs Externas
**Dilema:**
- URLs internas (`http://n8n_titanium:5678`) → Performance óptima, pero solo funciona desde dentro de Docker
- URLs externas (`https://n8n.stax.ink`) → Funciona desde fuera, pero timeout bajo carga

**Decisión tomada (FASE 2):** WF2 usa URLs internas para evitar timeouts bajo carga masiva.

**Consecuencia:** Worker externo no puede usar WF2 directamente.

---

## 🔧 SOLUCIONES PENDIENTES

### Opción A: Worker como Container Docker (RECOMENDADA)

Agregar al docker-compose:

```yaml
booking-queue-worker:
  build:
    context: .
    dockerfile: Dockerfile.worker
  container_name: booking_queue_worker
  restart: unless-stopped
  environment:
    - DATABASE_URL=postgres://...
    - ORCHESTRATOR_URL=http://n8n_titanium:5678/webhook/booking-orchestrator
  networks:
    - n8n-network
  depends_on:
    - n8n_titanium
    - postgres
```

**Ventajas:**
- Worker dentro de la red Docker
- Acceso a URLs internas de WF2
- Sin latencia de Cloudflare
- Escalable horizontalmente

**Desventajas:**
- Requiere crear Dockerfile adicional
- Un container más que mantener

### Opción B: WF2 Doble Configuración

WF2 tiene DOS paths:
- Interno: `http://n8n_titanium:5678/webhook/booking-orchestrator-internal` (URLs internas)
- Externo: `https://n8n.stax.ink/webhook/booking-orchestrator-external` (URLs públicas)

**Ventajas:**
- Worker externo puede usar path externo
- WF1 mantiene path interno para performance

**Desventajas:**
- Duplicar configuración de WF2
- Más complejo de mantener
- Riesgo de inconsistencia

### Opción C: Ejecución Directa desde Worker

Worker ejecuta lógica de WF2 directamente (sin llamar a WF2):
1. Adquirir lock (llamada directa a DB)
2. Check availability (query directa a DB)
3. Check circuit breaker (query directa a DB)
4. Crear GCal event (llamada directa a API de Google)
5. Crear booking (INSERT directo a DB)

**Ventajas:**
- Sin dependencias de WF2
- Máximo control
- Más rápido (sin overhead de webhook)

**Desventajas:**
- Duplicar lógica de negocio
- Más código que mantener
- Pierde beneficios de orquestación

---

## 📊 ESTADO ACTUAL

| Componente | Estado | Notas |
|------------|--------|-------|
| WF1_Async | ✅ Activo | ACK response <1s |
| WF8_Queue_Worker | ⚠️ Cron no ejecuta | Requiere workaround |
| WF9_Status | ⚠️ Path params no funciona | Workaround: query DB |
| booking_intents | ✅ Tabla creada | Funciones y vistas OK |
| Worker Externo | ✅ Script creado | URLs internas bloquean |

---

## 🎯 RECOMENDACIÓN

**Implementar Opción A (Worker como Container)**

**Razones:**
1. Mantiene arquitectura limpia
2. Sin duplicación de lógica
3. Performance óptima (red interna)
4. Escalable (múltiples workers)
5. Coherente con decisión de FASE 2 (URLs internas)

**Esuerzo estimado:** 2-4 horas
- Crear Dockerfile.worker
- Agregar al docker-compose.yml
- Configurar environment variables
- Test end-to-end

---

## 📝 PRÓXIMOS PASOS

1. **Decidir solución** (Opción A, B o C)
2. **Implementar workaround** para desbloquear testing
3. **Ejecutar end-to-end test** con solución temporal
4. **Refinar arquitectura** con solución definitiva

---

**Documentación relacionada:**
- `docs/FASE_1_COMPLETADA.md`
- `docs/FASE_2_COMPLETADA.md`
- `docs/FASE_3_EN_PROGRESO.md`
