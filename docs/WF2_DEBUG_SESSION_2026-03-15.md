# WF2 Booking Orchestrator - Debug Session 2026-03-15

## Resumen Ejecutivo

WF2_Booking_Orchestrator v2.0.0 fue debugueado paso a paso usando la API de n8n según el manual `docs/n8n-debug-api-manual.txt`. Se identificaron y corrigieron múltiples errores críticos.

**Workflow ID:** `Z7g7DgxXQ61V368P`  
**Estado:** ⚠️ En progreso - Error en nodo "Acquire Lock"  
**Técnica usada:** Debugging incremental vía API (SECCION 5 del manual)

---

## 🔍 Problemas Identificados y Soluciones

### 1. Workflow no se subía correctamente

**Síntoma:**
```
Error: 400 - Bad Request
```

**Causa:**
- El workflow tenía configuraciones inválidas en `settings`
- Valores incorrectos: `saveDataErrorExecution: "save"` (no válido)

**Solución:**
```json
{
  "settings": {
    "saveDataErrorExecution": "all",
    "saveDataSuccessExecution": "all",
    "saveManualExecutions": true,
    "saveExecutionProgress": true
  }
}
```

**Lección:** Los valores válidos son `all` o `none`, NO `save`.

---

### 2. Postgres Query Replacement - Formato incorrecto

**Error:**
```
"Query Parameters must be a string of comma-separated values or an array of values"
```

**Nodo:** `Check Idempotency DB`

**Causa:**
```javascript
// ❌ INCORRECTO - expresión directa
"queryReplacement": "={{ $json.ctx.idempotency_key }}"
```

**Solución:**
```javascript
// ✅ CORRECTO - array de valores
"queryReplacement": "={{ [$json.ctx.idempotency_key] }}"
```

**Aplicado también a:** `Create DB Booking` node

---

### 3. Merge Context - Acceso incorrecto a datos

**Error:**
```
"Cannot read properties of undefined (reading '_idempotency') [line 3]"
```

**Nodo:** `Merge Context`

**Causa:**
```javascript
// ❌ INCORRECTO - asume que $input tiene ctx
const ctx = $input.first().json.ctx;
```

**Solución:**
```javascript
// ✅ CORRECTO - obtener ctx del nodo original
const ctx = $("Generate Idempotency Key").first()?.json?.ctx || {};
```

---

### 4. HTTP Request Nodes - JSON Body Bug (GitHub #15996)

**Error:**
```
"JSON parameter needs to be valid JSON"
```

**Nodos afectados:**
- `Acquire Lock`
- `Check Circuit Breaker`
- `Record GCal Success`

**Causa:**
```javascript
// ❌ INCORRECTO - jsonBody con expresiones {{ }}
"jsonBody": "={{ {\n  provider_id: $json.ctx.provider_id,\n  ...\n} }}"
```

Este es el bug conocido de n8n GitHub issue #15996. Las expresiones `{{ }}` en `jsonBody` no se serializan correctamente.

**Solución en progreso:**
```javascript
// ✅ CORRECTO - bodyParameters con valores individuales
"bodyParameters": {
  "parameters": [
    {"name": "provider_id", "value": "={{ $json.ctx.provider_id }}"},
    {"name": "start_time", "value": "={{ $json.ctx.start_time }}"},
    {"name": "lock_duration_minutes", "value": "5"}
  ]
}
```

---

## 📊 Cronología del Debug

### Paso 1: Verificación inicial
```bash
# El webhook respondía pero sin ejecuciones registradas
curl -X POST https://n8n.stax.ink/webhook/booking-orchestrator \
  -d '{"provider_id": 1}'
# Response: {"message":"Error in workflow"}
```

### Paso 2: API Debug - SECCION 5 del manual
```bash
# Buscar ejecuciones con error
GET /api/v1/executions?workflowId=Z7g7DgxXQ61V368P&status=error

# Resultado inicial: 0 ejecuciones
# → Error ocurría ANTES de registrar ejecución (trigger node)
```

### Paso 3: Configuración de guardado
```bash
# Agregar settings de guardado al workflow
"saveDataErrorExecution": "all"
"saveDataSuccessExecution": "all"

# Después de esto, las ejecuciones comenzaron a registrarse
```

### Paso 4: Identificación de errores en cadena

| Ejecución | Last Node | Error |
|-----------|-----------|-------|
| 2847 | Check Idempotency DB | Query Parameters must be... |
| 2850 | Merge Context | Cannot read properties of undefined |
| 2851 | Acquire Lock | JSON parameter needs to be valid JSON |
| 2853 | Acquire Lock | JSON parameter needs to be valid JSON |

---

## 🛠️ Comandos de Debug Útiles

### Obtener última ejecución con error
```bash
curl -s "https://n8n.stax.ink/api/v1/executions?workflowId=WF_ID&limit=1" \
  -H "X-N8N-API-KEY: $KEY" | jq '.data[0].id'
```

### Obtener detalle completo de ejecución
```bash
curl -s "https://n8n.stax.ink/api/v1/executions/EXEC_ID?includeData=true" \
  -H "X-N8N-API-KEY: $KEY" | jq '{
  lastNode: .data.resultData.lastNodeExecuted,
  error: .data.resultData.error.message,
  runData: (.data.resultData.runData | keys)
}'
```

### Script automatizado (creado: `scripts-ts/debug_wf2_api.ts`)
```bash
npx tsx scripts-ts/debug_wf2_api.ts
```

---

## 📝 Lecciones Aprendidas

### 1. Guardado de ejecuciones es CRÍTICO
Sin `saveDataErrorExecution: "all"`, no hay forma de debuggear errores.

### 2. Postgres v2.6 requiere array en queryReplacement
Nunca usar expresión directa, SIEMPRE envolver en array:
```javascript
"={{ [$param1, $param2] }}"
```

### 3. HTTP Request + jsonBody + expresiones = BUG
Usar `bodyParameters` en vez de `jsonBody` cuando se usan expresiones `{{ }}`.

### 4. Merge Context debe obtener datos del nodo original
No confiar en `$input` después de un IF node.

### 5. Debug incremental es más efectivo
1. Probar workflow minimal (2 nodos)
2. Agregar nodos gradualmente
3. Identificar punto de fallo exacto

---

## ⚠️ Problemas Pendientes

### docker-compose (2026-03-15 15:35)
**Problema:** Contenedores existentes interferían con el startup.

**Solución aplicada:**
```bash
# Cleanup completo
docker-compose down -v --remove-orphans
docker rm -f n8n_postgres n8n task-runners

# Inicio limpio
docker-compose up -d
```

**Estado:** ✅ Resuelto - Todos los contenedores healthy

---

## 📈 Estado Actual

| Componente | Estado | Notas |
|------------|--------|-------|
| WF1_Booking_API_Gateway | ✅ PRODUCCIÓN | ID: 2G9ffjvKyF5bqDT5 |
| WF2_Booking_Orchestrator | ⚠️ DEBUG | ID: Z7g7DgxXQ61V368P |
| - Webhook | ✅ Funcional | |
| - Generate Idempotency Key | ✅ Funcional | |
| - Check Idempotency DB | ✅ Funcional | Fix: array en queryReplacement |
| - Is Duplicate? | ✅ Funcional | |
| - Merge Context | ✅ Funcional | Fix: obtener ctx de nodo original |
| - Check Availability | ✅ Funcional | |
| - Acquire Lock | ❌ Fallando | JSON body bug |
| - Check Circuit Breaker | ⏸️ Pendiente | Depende de Acquire Lock |
| - Create GCal Event | ⏸️ Pendiente | |
| - Create DB Booking | ⏸️ Pendiente | Fix: array en queryReplacement |

---

## 🎯 Próximos Pasos

1. **Fixear Acquire Lock** - Usar bodyParameters en vez de jsonBody
2. **Fixear Check Circuit Breaker** - Mismo patrón
3. **Fixear Record GCal Success** - Mismo patrón
4. **Ejecutar test completo** - Verificar flujo end-to-end
5. **Documentar solución final** - Crear `docs/WF2_SOLUTION_2026-03-15.md`

---

**Documento creado:** 2026-03-15 15:45  
**Autor:** AI Engineering Team  
**Referencia:** `docs/n8n-debug-api-manual.txt` SECCION 5
