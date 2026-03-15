# 📚 LECCIONES APRENDIDAS: REPARACIÓN SEED WORKFLOW

**Fecha:** 2026-03-12  
**Proyecto:** Booking Titanium  
**Workflow:** SEED_Book_Tomorrow + SUB_Seed_Single_Booking

---

## 🎯 RESUMEN EJECUTIVO

Hoy se realizó una auditoría y reparación completa del sistema SEED Booking. Los principales problemas fueron:

1. **Mapping incorrecto** en n8n v2.10+ (`$('X').item.json` → `$input.first().json`)
2. **workflowInputs.schema incompatible** con la versión de n8n
3. **Infraestructura inestable** (DAL service OOM killed)
4. **Colisiones de datos** (reservas previas bloqueando slots)

---

## ✅ LO QUE DEBO HACER (BEST PRACTICES)

### 1. Validación de Versiones de Nodos

**ANTES DE DESARROLLAR:**
```markdown
- [ ] Verificar typeVersion compatible con n8n v2.10.2+
- [ ] Consultar ssot-nodes.json para versiones disponibles
- [ ] Testear en entorno de desarrollo antes de producción
```

**Tabla de Versiones Compatibles:**
| Nodo | Version Mínima | Version Recomendada |
|------|----------------|---------------------|
| Execute Workflow | 1.3 | 1.3 |
| Execute Workflow Trigger | 1.1 | 1.1 |
| HTTP Request | 4.4 | 4.4 |
| Code | 2 | 2 |
| Webhook | 2.1 | 2.1 |

---

### 2. Patrón de Mapping en Sub-Workflows

**✅ CORRECTO (n8n v2.10+):**
```javascript
// En nodo Execute Sub-workflow (workflow padre):
{
  "workflowInputs": {
    "__rl": true,
    "value": {
      "provider_id": "={{ $json.provider_id }}",
      "service_id": "={{ $json.service_id }}",
      "start_time": "={{ $json.start_time }}"
    },
    "mode": "pairs"
  }
}

// En nodo dentro del sub-workflow:
$input.first().json.provider_id  // ✅ CORRECTO
```

**❌ INCORRECTO:**
```javascript
// En nodo dentro del sub-workflow:
$('Execute Workflow Trigger').item.json.provider_id  // ❌ NO FUNCIONA
```

---

### 3. Gestión de Infraestructura

**MONITOREO DIARIO:**
```bash
# Verificar contenedores críticos
docker ps --filter "name=dal" --format "table {{.Names}}\t{{.Status}}"

# Verificar logs de errores OOM
docker inspect booking_dal | grep -i oom

# Si está caído, reiniciar
docker start booking_dal
```

**CHECKLIST PRE-EJECUCIÓN:**
- [ ] DAL service está activo (`docker ps`)
- [ ] n8n está accesible
- [ ] Base de datos responde
- [ ] No hay reservas previas en slots objetivo

---

### 4. Limpieza de Datos de Testing

**RANGO DE USUARIOS SEED:**
```typescript
// Usar rangos específicos y documentados
// Seed actual: 9600000 - 9700000
// Seed anterior: 9300000 - 9500000
// Rango amplio para limpieza: 9300000 - 9900000

DELETE FROM bookings WHERE user_id >= 9300000 AND user_id < 9900000;
DELETE FROM users WHERE chat_id >= 9300000 AND chat_id < 9900000;
```

**SCRIPT clean_seed.ts ACTUALIZADO:**
```typescript
// Limpiar TODAS las reservas de testing
const r1 = await client.query(
  `DELETE FROM bookings WHERE user_id >= 9300000 AND user_id < 9900000`
);
```

---

### 5. Validación de Ejecuciones

**VERIFICAR CADA NODO:**
```typescript
// Script check_seed_executions_v2.ts
const runData = execution.data.resultData.runData;
Object.entries(runData).forEach(([nodeName, nodeExec]) => {
  if (nodeExec[0].error) {
    console.error(`❌ ${nodeName}: ${nodeExec[0].error.message}`);
  } else {
    const count = nodeExec[0].data?.main[0]?.length || 0;
    console.log(`✅ ${nodeName}: ${count} items`);
  }
});
```

**PUNTOS CRÍTICOS A VERIFICAR:**
1. Webhook → ✅ Recibe datos
2. Build Config → ✅ Genera N items
3. Execute Sub-workflow → ✅ Invoca correctamente
4. DAL Create → ✅ Retorna success: true
5. GCAL Create → ✅ Retorna gcal_event_id
6. DAL Update → ✅ Actualiza gcal_event_id

---

### 6. Manejo de Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `schema.filter is not a function` | workflowInputs.schema incompatible | Eliminar schema, usar `mode: "pairs"` |
| `Bad request - please check your parameters` | Mapping incorrecto o DAL caído | Verificar `$input.first().json` y estado del DAL |
| `The connection cannot be established` | DAL service caído | `docker start booking_dal` |
| `SLOT_OCCUPIED` | Reservas previas en DB | Ejecutar `clean_seed.ts` antes de test |

---

## ❌ LO QUE NO DEBO HACER (ANTI-PATTERNS)

### 1. NO usar sintaxis deprecated de n8n

**❌ NUNCA:**
```javascript
// Esta sintaxis NO funciona en n8n v2.10+
$('NodeName').item.json.field
$('NodeName').first().json.data?.field  // Solo si NodeName existe
```

**✅ SIEMPRE:**
```javascript
// Usar $input para datos del nodo anterior
$input.first().json.field
$json.field  // Dentro del mismo nodo
```

---

### 2. NO ejecutar SEED sin verificar estado previo

**❌ NUNCA:**
```bash
# Ejecutar sin verificar
curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow

# Si hay reservas previas → SLOT_OCCUPIED
```

**✅ SIEMPRE:**
```bash
# 1. Verificar DAL
docker ps --filter "name=dal"

# 2. Verificar reservas existentes
npx tsx scripts-ts/audit_seed_bookings.ts 2026-03-13

# 3. Limpiar si es necesario
npx tsx scripts-ts/clean_seed.ts

# 4. Ejecutar SEED
curl -X POST https://n8n.stax.ink/webhook/seed-tomorrow

# 5. Verificar resultado
npx tsx scripts-ts/audit_seed_bookings.ts 2026-03-13
```

---

### 3. NO hardcodear IDs de workflow sin verificar

**❌ NUNCA:**
```javascript
// Asumir que el ID es correcto
"workflowId": "qCCOLoAHJTl1BibE"  // ¿Es el correcto?
```

**✅ SIEMPRE:**
```bash
# Verificar en workflow_activation_order.json
cat scripts-ts/workflow_activation_order.json | grep -A 2 SUB_Seed

# O consultar API de n8n
curl -s "https://n8n.stax.ink/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.[] | select(.name | contains("SUB_Seed"))'
```

---

### 4. NO ignorar errores de conexión

**❌ NUNCA:**
```
Error: The connection cannot be established
→ Ignorar y reintentar infinitamente
```

**✅ SIEMPRE:**
```bash
# 1. Verificar si el servicio destino está activo
docker ps | grep dal-service

# 2. Verificar logs del servicio
docker logs booking_dal --tail 50

# 3. Si está caído, investigar causa
docker inspect booking_dal | grep -i oom

# 4. Reiniciar si es necesario
docker restart booking_dal
```

---

### 5. NO crear workflows sin Error Handler

**❌ NUNCA:**
```
Workflow sin conexión a NN_00_Global_Error_Handler
→ Errores silenciosos, sin tracking
```

**✅ SIEMPRE:**
```
Manual Trigger / Webhook
  → [Lógica Principal]
  → Error Handler → NN_00_Global_Error_Handler
  → Success → Standard Contract Output
```

---

## 🔧 HERRAMIENTAS DE AUDITORÍA CREADAS

### Scripts de Verificación

| Script | Propósito | Uso |
|--------|-----------|-----|
| `audit_seed_bookings.ts` | Verifica DB y colisiones | `npx tsx scripts-ts/audit_seed_bookings.ts YYYY-MM-DD` |
| `check_seed_executions_v2.ts` | Detalla errores por nodo | `npx tsx scripts-ts/check_seed_executions_v2.ts` |
| `check_last_executions.ts` | Últimas 5 ejecuciones | `npx tsx scripts-ts/check_last_executions.ts` |
| `clean_seed.ts` | Limpia reservas de testing | `npx tsx scripts-ts/clean_seed.ts` |

### Endpoints de Verificación

```bash
# Verificar ejecuciones de workflow específico
curl -s "https://n8n.stax.ink/api/v1/executions?workflowId=HxMojMqbRiNgquvd&limit=5&includeData=true" \
  -H "X-N8N-API-KEY: $N8N_API_KEY"

# Verificar estado de workflow
curl -s "https://n8n.stax.ink/api/v1/workflows/HxMojMqbRiNgquvd" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | jq '.active'
```

---

## 📋 CHECKLIST PARA FUTUROS DESARROLLOS

### Pre-Desarrollo
- [ ] Verificar versiones de nodos en ssot-nodes.json
- [ ] Definir rangos de datos de testing (chat_id, user_id)
- [ ] Crear script de limpieza de datos
- [ ] Configurar Error Handler en workflow

### Pre-Test
- [ ] DAL service está activo
- [ ] Base de datos responde
- [ ] No hay datos previos en slots objetivo
- [ ] n8n API es accesible

### Durante Test
- [ ] Monitorear ejecuciones en tiempo real
- [ ] Verificar output de cada nodo
- [ ] Capturar errores específicos por nodo

### Post-Test
- [ ] Verificar integridad en DB
- [ ] Verificar sync con servicios externos (GCAL)
- [ ] Limpiar datos de testing
- [ ] Documentar hallazgos en AUDIT_*.md

---

## 🎯 MÉTRICAS DE ÉXITO

| Métrica | Target | Cómo Medir |
|---------|--------|------------|
| Reservas creadas | 100% | `audit_seed_bookings.ts` |
| Colisiones | 0 | `audit_seed_bookings.ts` |
| Sync GCAL | 100% | `extract-gcal.ts` |
| Tiempo ejecución | < 30s | n8n execution duration |
| Errores silenciosos | 0 | NN_00_Global_Error_Handler logs |

---

## 📚 REFERENCIAS

- **GEMINI.md** - System prompt v4.2 con prohibiciones y patrones
- **N8N_LIFECYCLE_GUIDE.md** - Ciclo de vida completo
- **ssot-nodes.json** - Versiones de nodos compatibles
- **AUDIT_COMPLETED_2026-03-12.md** - Informe de esta reparación

---

**Generado por:** Qwen Code  
**Timestamp:** 2026-03-12T15:30:00-03:00  
**Basado en:** Experiencia real de debugging y reparación
