# 🔄 REFACTORING: SEED WORKFLOWS v1 → v2

**Fecha:** 2026-03-12  
**Versión:** 2.0.0  
**Compliance:** GEMINI.md v4.2

---

## 📊 RESUMEN DE CAMBIOS

| Workflow | Archivos | Estado |
|----------|----------|--------|
| SEED_Book_Tomorrow | `SEED_Book_Tomorrow_v2.json` | ✅ Creado |
| SUB_Seed_Single_Booking | `SUB_Seed_Single_Booking_v2.json` | ✅ Creado |

---

## ✅ PATRONES IMPLEMENTADOS (v2.0)

### O01: Triple Entry Pattern ✅
```json
// SEED_Book_Tomorrow
📥 IN: Manual Trigger ─┐
📥 IN: Webhook ────────┼──→ [Lógica]
                       └──→ 📤 OUT: Standard Contract

// SUB_Seed_Single_Booking  
📥 IN: Execute Workflow Trigger ─→ [Lógica] ─→ 📤 OUT: Standard Contract
```

### O02: Standard Contract Output ✅
```json
{
  "success": boolean,
  "error_code": null | "CODE",
  "error_message": null | "message",
  "data": {...} | null,
  "_meta": {
    "source": "SEED_BOOK_TOMORROW",
    "workflow_id": "HxMojMqbRiNgquvd",
    "timestamp": "ISO8601",
    "version": "1.0.0"
  }
}
```

### O04: Watchdog Pattern ✅
```json
"options": {
  "timeout": 60000,
  "retryOnFail": true
}
```

### SEC02: Validation Sandwich ✅
```
Input → Build Seed Config (valida regex) → Op → Is Success? → Output
                                        ↓
                                  Error Handler
```

### SEC04: Regex Whitelist ✅
```javascript
// En Build Seed Config
const nameRegex = /^[A-Za-z\s]+$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!nameRegex.test(user_name)) {
  throw new Error(`Invalid user_name format: ${user_name}`);
}
```

---

## 🔧 MEJORAS ESPECÍFICAS

### 1. SEED_Book_Tomorrow

| Mejora | v1 | v2 |
|--------|----|----|
| Triple Entry | ❌ Parcial | ✅ Completo (Manual + Webhook) |
| Standard Contract | ⚠️ Básico | ✅ Completo con _meta |
| Error Handler | ❌ | ✅ Con nodo dedicado |
| Is Success Check | ❌ | ✅ Nodo IF explícito |
| Validation | ❌ | ✅ Regex whitelist en Code |
| Stickers | ❌ | ✅ 📥 IN / 📤 OUT |
| Meta version | ❌ | ✅ 1.0.0 |

### 2. SUB_Seed_Single_Booking

| Mejora | v1 | v2 |
|--------|----|----|
| workflowInputs | ⚠️ Parcial | ✅ Completo con mode: pairs |
| Standard Contract | ❌ | ✅ Al final del flujo |
| Error Handler | ❌ | ✅ Conecta desde onError |
| Is Success Check | ❌ | ✅ Después de DAL Create |
| Retry Config | ❌ | ✅ 3 intentos por HTTP |
| Timeout | ❌ | ✅ 30s por HTTP |
| Stickers | ❌ | ✅ 📥 IN / 📤 OUT |
| Meta version | ❌ | ✅ 1.0.0 |

---

## 🚨 ERRORES CORREGIDOS

### 1. ❌ → ✅ Mapping en Sub-Workflow

**v1 (Incorrecto):**
```javascript
$('Execute Workflow Trigger').item.json.user_name
```

**v2 (Correcto):**
```javascript
$input.first().json.user_name
```

### 2. ❌ → ✅ workflowInputs Schema

**v1 (Incompatible):**
```json
"workflowInputs": {
  "schema": { "type": "object", ... }  // ❌ schema.filter error
}
```

**v2 (Compatible):**
```json
"workflowInputs": {
  "__rl": true,
  "value": {
    "provider_id": "={{ $json.provider_id }}",
    "user_name": "={{ $json.user_name }}"
  },
  "mode": "pairs"  // ✅ Sin schema
}
```

### 3. ❌ → ✅ Error Handling

**v1 (Sin manejo):**
```
DAL Create → GCAL Create → DAL Update
(qualquier error rompe el flujo)
```

**v2 (Con manejo):**
```
DAL Create → Is Success? → GCAL Create → DAL Update → Standard Contract
     ↓            ↓             ↓            ↓
  onError     false → Error Handler ← onError
```

---

## 📋 CHECKLIST DE MIGRACIÓN

### Pre-Migración
- [ ] Exportar workflows actuales (backup)
- [ ] Documentar IDs actuales
- [ ] Notificar a stakeholders

### Migración
- [ ] Subir `SEED_Book_Tomorrow_v2.json` a n8n
- [ ] Subir `SUB_Seed_Single_Booking_v2.json` a n8n
- [ ] Verificar IDs en workflow_activation_order.json
- [ ] Activar ambos workflows
- [ ] Testear con 1 slot primero

### Post-Migración
- [ ] Ejecutar test completo (8 slots)
- [ ] Verificar DB (8 reservas)
- [ ] Verificar GCAL (8 eventos)
- [ ] Verificar logs (0 errores)
- [ ] Eliminar workflows v1

---

## 🧪 PLAN DE TEST

### Test 1: Ejecución Exitosa
```bash
# 1. Limpiar datos previos
npx tsx scripts-ts/clean_seed.ts

# 2. Ejecutar SEED
curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow

# 3. Verificar resultado
npx tsx scripts-ts/audit_seed_bookings.ts 2026-03-13
# Esperado: 8 reservas, 0 colisiones, 8 GCAL
```

### Test 2: Error Handling
```bash
# 1. Detener DAL
docker stop booking_dal

# 2. Ejecutar SEED
curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow

# 3. Verificar error manejado
# Esperado: success: false, error_code: SEED_WORKFLOW_ERROR
```

### Test 3: Validación de Input
```bash
# 1. Modificar Build Seed Config temporalmente
# 2. Inyectar user_name inválido: "Seed_Patient_123"
# 3. Ejecutar
# Esperado: Error "Invalid user_name format"
```

---

## 📈 MÉTRICAS DE ÉXITO

| Métrica | v1 | v2 Target |
|---------|----|-----------|
| Ejecuciones exitosas | 1/8 | 8/8 |
| Errores manejados | 0% | 100% |
| Standard Contract | 50% | 100% |
| Sync GCAL | 12.5% | 100% |
| Timeout errors | ? | 0 |
| Retry success | N/A | 3 intentos |

---

## 🔗 REFERENCIAS

- **GEMINI.md** - System prompt v4.2
- **ssot-nodes.json** - Versiones compatibles
- **LESSONS_LEARNED_SEED_2026-03-12.md** - Lecciones aprendidas
- **AUDIT_COMPLETED_2026-03-12.md** - Auditoría anterior

---

**Generado por:** Qwen Code  
**Timestamp:** 2026-03-12T16:00:00-03:00  
**Versión:** 2.0.0
