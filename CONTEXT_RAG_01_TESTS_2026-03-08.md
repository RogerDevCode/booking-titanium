# Contexto: RAG_01 Tests - 2026-03-08

## Objetivo Original
Crear test básico para el workflow `RAG_01_Document_Ingestion` y ejecutarlo.

## Archivos Involucrados

| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `tests/rag_01.test.ts` | ✅ Creado | Test suite con 6 tests básicos |
| `workflows/RAG_01_Document_Ingestion.json` | ⚠️ Modificado | Workflow local actualizado (no subido al servidor) |
| `test_rag_01_v1.4.0.js` | ❌ Borrado | Test antiguo en root (eliminado) |

---

## Cambios Realizados en el Workflow Local

### 1. Agregado `onError: "continueErrorOutput"` a nodos Code
Esto permite que los errores sean capturados por el error handler en lugar de detener el workflow.

**Nodos modificados:**
- `Validate & Normalize` (línea ~47)
- `Post-Validate Embedding` (línea ~126)
- `Build Parameterized Query` (línea ~163)
- `Post-Validate Insert` (línea ~195)

### 2. Regex actualizado para permitir caracteres en español
**Problema:** La regex original `[\w\s\-\'\"...]` no permitía tildes (áéíóú) ni ñ.

**Cambio:**
```javascript
// ANTES:
const safeStringRegex = /^[\w\s\-\'\"\.\,\?\!\(\)\:\;\n\r]{1,500}$/;

// DESPUÉS:
const safeStringRegex = /^[\w\s\-\'\"\.\,\?\!\(\)\:\;\n\r\u00C0-\u00FF]{1,500}$/;
```

El rango `\u00C0-\u00FF` incluye: ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ

---

## Problema Encontrado

### Error en Tests
```
✕ All 6 tests fail with: {"message": "Error in workflow"}
```

### Causa Raíz
El workflow en el servidor (`https://n8n.stax.ink`) tiene la **versión antigua** sin los fixes aplicados.

### Intento de Solución
Se intentó subir el workflow actualizado usando:
```bash
npx tsx scripts-ts/n8n_crud_agent.ts --action upsert --file workflows/RAG_01_Document_Ingestion.json --activate
```

**Error:** API retorna `401 Unauthorized`

### Diagnóstico de API
```bash
# X-N8N-API-Key con JWT public-api → 401 unauthorized
# Authorization: Bearer con JWT mcp-server-api → 'X-N8N-API-KEY header required'
```

**Conclusión:** La API REST de n8n (`/api/v1/workflows`) requiere una API key generada en **Settings → API** de la UI de n8n, que no está disponible en el `.env`.

---

## Estado Actual

### Local (✅ Completado)
- [x] Workflow modificado con `onError: "continueErrorOutput"`
- [x] Regex actualizado para español
- [x] Test suite creado (`tests/rag_01.test.ts`)

### Servidor (⏸️ Pendiente)
- [ ] Subir workflow actualizado al servidor
- [ ] Activar workflow en n8n
- [ ] Ejecutar tests contra servidor

---

## Próximos Pasos (Para Continuar)

### Opción A: Subida Manual (Recomendado)
1. Ir a `https://n8n.stax.ink`
2. Workflows → Import workflow
3. Seleccionar `workflows/RAG_01_Document_Ingestion.json`
4. Activar el workflow
5. Ejecutar tests: `npx jest tests/rag_01.test.ts --testTimeout=60000`

### Opción B: Generar API Key
1. Ir a Settings → API en n8n UI
2. Generar nueva API key
3. Agregar al `.env`:
   ```env
   N8N_API_KEY=<api_key_generada>
   ```
4. Usar script CRUD para subir workflow

### Opción C: Usar n8n CLI
1. Instalar n8n CLI si está disponible
2. Autenticar con credenciales de usuario
3. Subir workflow vía CLI

---

## Tests en `tests/rag_01.test.ts`

| # | Test | Descripción | Estado |
|---|------|-------------|--------|
| 1 | `ingests valid schedule document` | Documento válido con Standard Contract | ⏸️ Pendiente |
| 2 | `ingests valid policy document` | Documento policy válido | ⏸️ Pendiente |
| 3 | `rejects document with invalid provider_id` | provider_id negativo | ⏸️ Pendiente |
| 4 | `rejects document with content too short` | content < 10 chars | ⏸️ Pendiente |
| 5 | `rejects document with missing required fields` | Sin provider_id | ⏸️ Pendiente |
| 6 | `returns complete Standard Contract structure` | Valida estructura O02 | ⏸️ Pendiente |

---

## Datos de Prueba Válidos

```json
{
  "provider_id": 1,
  "title": "Horarios de Atencion",
  "content": "Nuestra clinica atiende de lunes a viernes de 8:00 AM a 8:00 PM, y sabados de 9:00 AM a 2:00 PM. Los domingos y festivos estamos cerrados.",
  "source_type": "schedule",
  "status": "published",
  "language": "es"
}
```

**Nota:** El título y contenido ahora pasan la validación de regex gracias al fix `\u00C0-\u00FF`.

---

## Comandos Útiles

```bash
# Ejecutar tests
npx jest tests/rag_01.test.ts --testTimeout=60000

# Verificar workflow en servidor (si hay API key)
curl -s "https://n8n.stax.ink/api/v1/workflows" \
  -H "X-N8N-API-Key: <API_KEY>" | jq '.data[] | select(.name | test("RAG"))'

# Test directo con curl
curl -s -X POST "https://n8n.stax.ink/webhook/rag-ingest-document" \
  -H "Content-Type: application/json" \
  -d '{"provider_id":1,"title":"Test","content":"Contenido de prueba valido","source_type":"faq","status":"published","language":"es"}'
```

---

## Referencias

- GEMINI.md: System Prompt v4.0 (n8n v2.10.2+)
- O02: Standard Contract Pattern
- SEC02: Validation Sandwich
- SEC04: Regex Whitelist
- onError: continueErrorOutput (n8n v2.x feature)

---

**Fecha:** 2026-03-08
**Autor:** Qwen Code
**Estado:** Pendiente - Esperando subida de workflow al servidor
