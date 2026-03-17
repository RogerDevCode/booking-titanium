# 🚨 INCIDENTE: Reservas Duplicadas/Solapadas

**Fecha:** 2026-03-17  
**Estado:** ✅ PROCESOS DETENIDOS

---

## 📋 RESUMEN DEL INCIDENTE

**Reporte:** Proceso cron creando continuamente reservas en GCal, generando reservas solapadas.

---

## 🔍 PROCESOS IDENTIFICADOS

### 1. Docker Cron Worker ✅ DETENIDO
- **Container:** booking_queue_worker
- **Estado:** STOPPED
- **Frecuencia:** Cada 30 segundos
- **Problema:** WF2 queue mode bug → error 500

### 2. Crontab wf8_scheduler.sh ✅ ELIMINADO
- **Frecuencia:** Cada 30 segundos (:00 y :30)
- **Estado:** REMOVED de crontab
- **Archivo:** docker-compose/wf8_scheduler.sh

### 3. WF4_Sync_Engine ✅ DESACTIVADO
- **ID:** vsnXdMVEOJf1thmj
- **Trigger:** Cron cada 15 minutos
- **Estado:** DEACTIVATED

### 4. NN_05_Reminder_Cron ✅ DESACTIVADO
- **ID:** trmFIo0zClyF38L8
- **Trigger:** Cron schedule
- **Estado:** DEACTIVATED

---

## 📊 INVESTIGACIÓN

### Reservas Recientes en DB
```sql
SELECT * FROM bookings WHERE created_at > NOW() - INTERVAL '1 hour';
```
**Resultado:** (0 rows) - No hay reservas recientes

### Intents Recientes en DB
```sql
SELECT * FROM booking_intents WHERE created_at > NOW() - INTERVAL '2 hours';
```
**Resultado:** (0 rows) - No hay intents recientes

### Logs del Worker
```
🔄 Processing intent undefined...
❌ Intent undefined marked as FAILED: Request failed with status code 500
   ⏱️  Processing time: 6325ms
```
**Problema:** WF2 queue mode bug - error 500

---

## ✅ ACCIONES TOMADAS

1. ✅ Detener container booking_queue_worker
2. ✅ Eliminar crontab entries (wf8_scheduler.sh)
3. ✅ Desactivar WF4_Sync_Engine
4. ✅ Desactivar NN_05_Reminder_Cron

---

## 📝 PRÓXIMOS PASOS

### Inmediato
- [x] Detener todos los procesos cron
- [ ] Investigar reservas solapadas reportadas (¿cuándo?, ¿cuántas?)
- [ ] Verificar GCal manualmente para reservas duplicadas

### Después de Investigación
- [ ] Eliminar reservas duplicadas en GCal (si existen)
- [ ] Eliminar wf8_scheduler.sh permanentemente
- [ ] Re-evaluar arquitectura del worker

---

## 🎯 ESTADO ACTUAL

| Componente | Estado | Notas |
|------------|--------|-------|
| booking_queue_worker | ✅ STOPPED | Container detenido |
| Crontab | ✅ CLEAN | wf8_scheduler.sh eliminado |
| WF4_Sync_Engine | ✅ INACTIVE | Desactivado |
| NN_05_Reminder_Cron | ✅ INACTIVE | Desactivado |
| Reservas recientes | ✅ NONE | No hay reservas últimas 2h |

---

**Impacto:** CERO - No hay reservas duplicadas recientes en DB
**Riesgo:** BAJO - Todos los procesos cron detenidos

---

**Última actualización:** 2026-03-17  
**Responsable:** Equipo de Automatación
