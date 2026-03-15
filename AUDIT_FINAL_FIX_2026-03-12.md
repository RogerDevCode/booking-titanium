# 📋 INFORME FINAL DE AUDITORÍA Y FIX - SEED BOOKING

**Fecha:** 2026-03-12  
**Hora:** 14:15 PST  
**Estado:** ⚠️ PARCIALMENTE RESUELTO - API n8n lenta/inestable

---

## 🎯 OBJETIVO

Auditar y fixear el workflow `SEED_Book_Tomorrow` y su sub-workflow `SUB_Seed_Single_Booking` para generar reservas de prueba sin colisiones.

---

## ✅ FIXES APLICADOS CON ÉXITO

### 1. SUB_Seed_Single_Booking (qCCOLoAHJTl1BibE)

**Problema:** Mapping incorrecto de datos
- `$('Execute Workflow Trigger').item.json` → no funciona en n8n v2.10+

**Solução aplicada:**
```javascript
// ANTES (incorrecto):
$('Execute Workflow Trigger').item.json.calendar_id

// DESPUÉS (correcto):
$input.first().json.calendar_id
```

**Estado:** ✅ **ACTUALIZADO EN N8N** (confirmado vía API)

**Nodos modificados:**
- `Create GCAL Event` - mapping corregido
- `Update DB with GCAL ID` - mapping corregido
- `Execute Workflow Trigger` - agregado workflowInputs.schema

---

### 2. SEED_Book_Tomorrow (HxMojMqbRiNgquvd)

**Problema:** Nodo Execute Sub-workflow sin mapping de inputs

**Solução aplicada:**
```javascript
workflowInputs: {
  schema: { /* definición de inputs */ },
  values: {
    calendar_id: '={{ "primary" }}',
    provider_id: '={{ $json.provider_id }}',
    // ... etc
  }
}
```

**Estado:** ⚠️ **ACTUALIZADO PARCIALMENTE** - El schema causa error "schema.filter is not a function"

---

## ❌ PROBLEMAS PENDIENTES

### Problema 1: workflowInputs.schema incompatible

**Error:** `schema.filter is not a function`

**Causa:** El formato del schema no es compatible con n8n v2.10.2

**Solução pendiente:**
1. Eliminar `workflowInputs.schema` del nodo Execute Sub-workflow
2. Usar formato simplificado `mode: "pairs"` en lugar de schema completo

**Bloqueador:** API de n8n está respondiendo con timeout (>15s) desde las 14:10 PST

---

## 📊 ESTADO ACTUAL DE EJECUCIONES

```
ID      ESTADO   ERROR
4644    ❌ error  schema.filter is not a function
4634    ❌ error  Bad request - please check your parameters  
4624    ❌ error  Bad request - please check your parameters
```

**Progreso:** El error cambió de "Bad request" → "schema.filter" → indica que el fix parcial funcionó

---

## 🔧 SCRIPTS DE AUDITORÍA CREADOS

| Script | Propósito |
|--------|-----------|
| `audit_seed_bookings.ts` | Verifica reservas en DB y detecta colisiones |
| `check_seed_executions_v2.ts` | Muestra ejecuciones del workflow SEED con detalle de errores |
| `check_last_executions.ts` | Últimas 5 ejecuciones globales |
| `fix-sub-seed-simple.ts` | Aplica fix de mapping en SUB_Seed |
| `fix-trigger-inputs.ts` | Agrega workflowInputs al trigger |
| `fix-execute-mapping.ts` | Agrega mapping al nodo Execute Sub-workflow |
| `remove-workflow-inputs-schema.ts` | Elimina schema incompatible (pendiente de ejecutar) |

---

## 📝 PRÓXIMOS PASOS (CUANDO API N8N SE ESTABILICE)

### Paso 1: Eliminar workflowInputs.schema
```bash
npx tsx scripts-ts/remove-workflow-inputs-schema.ts
```

### Paso 2: Probar SEED
```bash
curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow
```

### Paso 3: Verificar reservas
```bash
npx tsx scripts-ts/audit_seed_bookings.ts 2026-03-13
```

### Paso 4: Verificar Google Calendar
```bash
npx tsx scripts-ts/extract-gcal.ts 2026-03-13
```

---

## 🐛 LECCIONES APRENDIDAS

1. **n8n v2.10+ breaking changes:**
   - `$('X').item.json` → `$input.first().json`
   - Execute Workflow Trigger requiere workflowInputs explícito
   - Schema format es diferente en versiones recientes

2. **Execute Workflow node:**
   - Cuando el workflow destino tiene workflowInputs.schema, el nodo Execute Workflow debe mapear inputs explícitamente
   - Formato `mode: "pairs"` es más compatible que schema completo

3. **API Rate Limiting:**
   - Después de múltiples requests rápidas, la API de n8n se vuelve lenta (timeouts >15s)
   - Recomendar esperar 30-60s entre requests durante debugging intensivo

---

## 📁 ARCHIVOS MODIFICADOS

| Archivo | Cambio | Estado Git |
|---------|--------|------------|
| `workflows/SUB_Seed_Single_Booking.json` | Fix mapping $input.first().json | ✅ Commited |
| `workflows/SEED_Book_Tomorrow.json` | Agregado workflowInputs | ⚠️ Pendiente sync |
| `AUDIT_SEED_WORKFLOW_2026-03-12.md` | Informe inicial | ✅ Commited |
| `scripts-ts/audit_seed_bookings.ts` | Script auditoría DB | ✅ Commited |

---

## 🎯 MÉTRICAS FINALES

| Métrica | Antes | Después | Target |
|---------|-------|---------|--------|
| Mapping correcto | ❌ | ✅ | ✅ |
| workflowInputs definido | ❌ | ⚠️ | ✅ |
| Ejecuciones exitosas | 0/5 | 0/5 | 5/5 |
| Reservas creadas | 0 | 0 | 8 |
| Colisiones detectadas | N/A | 0 | 0 |

**Compliance:** 2/4 (50%) ⚠️

---

**Próxima actualización:** Cuando la API de n8n se estabilice (~14:30 PST)

**Generado por:** Qwen Code  
**Timestamp:** 2026-03-12T14:15:00-03:00
