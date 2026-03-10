# 📋 PLAN DE EJECUCIÓN — RAG_01_Document_Ingestion v1.3.1

**Fecha:** 2026-03-07  
**Workflow:** RAG_01_Document_Ingestion  
**Versión:** 1.3.1  
**Estado:** ✅ LISTO PARA IMPLEMENTAR

---

## 📁 ARCHIVOS GENERADOS

| Archivo | Propósito | Ubicación |
|---------|-----------|-----------|
| `01_verify_schema.sql` | Verificar schema en Neon | `database/rag/` |
| `02_setup_openai_credentials.md` | Configurar credenciales | `database/rag/` |
| `RAG_01_Document_Ingestion_v1.3.1.json` | Workflow corregido | `workflows/` |
| `test_rag01.sh` | Script de tests | `tests/` |
| `PLAN_DE_EJECUCION_RAG01.md` | Este documento | `database/rag/` |

---

## ✅ CHECKLIST PRE-IMPLEMENTACIÓN

### FASE 1: Verificar Base de Datos (Neon)

**Archivo:** `database/rag/01_verify_schema.sql`

```bash
# Ejecutar en Neon Console o vía psql
psql "postgresql://user:password@host.neon.tech/neondb?sslmode=require" \
  -f database/rag/01_verify_schema.sql
```

**Resultados esperados:**
- [ ] ✅ vector extension (v0.7+)
- [ ] ✅ rag_source_type (ENUM)
- [ ] ✅ rag_document_status (ENUM)
- [ ] ✅ rag_documents (tabla con 16 columnas)
- [ ] ✅ 7 índices (HNSW, B-tree, GIN)
- [ ] ✅ Funciones `search_rag_documents`, `hybrid_search_rag_documents`

**Si algo falta:**
```bash
psql "postgresql://..." -f database/rag/step_02_create_schema.sql
```

---

### FASE 2: Configurar Credenciales en n8n

**Archivo:** `database/rag/02_setup_openai_credentials.md`

#### 2.1 Credencial OpenAI (ya existe)

- **ID:** `gjFJosmeTXLpisjl`
- **Nombre:** `OpenAi account`
- **Verificar:** Que la API key sea válida

**Test:**
```bash
curl -X POST "https://api.openai.com/v1/embeddings" \
  -H "Authorization: Bearer sk-proj-..." \
  -H "Content-Type: application/json" \
  -d '{"input": "test", "model": "text-embedding-3-small"}' | jq '.data[0].embedding | length'
# Expected: 1536
```

#### 2.2 Credencial PostgreSQL (ya existe)

- **ID:** `SFNQsmuu4zirZAnP`
- **Nombre:** `Postgres account`
- **Verificar:** Conexión a Neon

---

### FASE 3: Importar Workflow a n8n

**Archivo:** `workflows/RAG_01_Document_Ingestion_v1.3.1.json`

#### 3.1 Importar vía UI

1. Ir a `https://n8n.stax.ink/workflows`
2. Click **"Import"**
3. Seleccionar: `workflows/RAG_01_Document_Ingestion_v1.3.1.json`
4. Verificar que aparecen **9 nodos**:
   - [ ] Webhook
   - [ ] Execute Workflow Trigger
   - [ ] Manual Trigger
   - [ ] Validate & Normalize
   - [ ] Is Valid?
   - [ ] Format Validation Error
   - [ ] Get OpenAI Embedding
   - [ ] Insert into rag_documents
   - [ ] Format Success Response

#### 3.2 Verificar Conexiones

```
Webhook ─┐
         ├─→ Validate & Normalize → Is Valid?
Execute ─┘                           ├─ true → Get OpenAI Embedding → Insert → Format Success
Manual ──┘                           └─ false → Format Validation Error → Format Success
```

**Verificar en UI:**
- [ ] Todas las conexiones están presentes
- [ ] No hay nodos aislados
- [ ] IF node tiene 2 outputs (true/false)

---

### FASE 4: Activar Workflow

1. En UI de n8n, toggle **"Active"** → ON
2. Verificar que no hay errores de validación
3. Copiar Webhook URL: `https://n8n.stax.ink/webhook/rag-ingest-document`

---

### FASE 5: Testear

#### 5.1 Test Manual (UI n8n)

1. Click **"Execute Workflow"**
2. Input:
```json
{
  "provider_id": 1,
  "title": "Horarios de Atención",
  "content": "Nuestra clínica atiende de lunes a viernes de 8:00 AM a 8:00 PM.",
  "source_type": "schedule",
  "status": "published",
  "language": "es"
}
```

3. **Output esperado:**
```json
{
  "success": true,
  "error_code": null,
  "data": {
    "document_id": "uuid-here",
    "title": "Horarios de Atención",
    "provider_id": 1
  }
}
```

#### 5.2 Test con Script

```bash
chmod +x tests/test_rag01.sh
./tests/test_rag01.sh
```

**Tests incluidos:**
- [ ] Test 1: Documento válido (schedule) → ✅ success: true
- [ ] Test 2: Documento válido (policy) → ✅ success: true
- [ ] Test 3: provider_id negativo → ✅ success: false (rechazado)
- [ ] Test 4: content muy corto → ✅ success: false (rechazado)

#### 5.3 Test con curl

```bash
curl -X POST "https://n8n.stax.ink/webhook/rag-ingest-document" \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": 1,
    "title": "Test de Prueba",
    "content": "Este es un documento de prueba para verificar que el workflow funciona correctamente."
  }' | jq '.'
```

---

### FASE 6: Verificar en Base de Datos

```sql
-- Verificar documentos insertados
SELECT 
  id, 
  title, 
  source_type, 
  status, 
  language,
  pg_vector.vector_dims(embedding) as embedding_dims,
  created_at
FROM rag_documents 
ORDER BY created_at DESC 
LIMIT 5;
```

**Output esperado:**
```
id: uuid-here
title: "Test de Prueba"
source_type: "other"
status: "published"
language: "es"
embedding_dims: 1536
created_at: 2026-03-07 15:XX:XX
```

---

## 🚨 ROLLBACK (si algo falla)

### 1. Desactivar Workflow
- UI de n8n → Toggle **"Active"** → OFF

### 2. Eliminar Workflow
- UI de n8n → Delete workflow

### 3. Limpiar DB
```sql
-- Eliminar documentos de test
DELETE FROM rag_documents 
WHERE metadata->>'version' = '1.3.1'
   OR title LIKE '%Test%'
   OR title LIKE '%Prueba%';

-- Verificar limpieza
SELECT COUNT(*) FROM rag_documents WHERE title LIKE '%Test%';
-- Debe retornar: 0
```

---

## 📊 MÉTRICAS DE ÉXITO

| Métrica | Target | Verificación |
|---------|--------|--------------|
| Embedding dimensions | 1536 | `pg_vector.vector_dims()` |
| Tiempo de ingestión | < 5s | n8n execution log |
| Success rate (test) | 100% | `test_rag01.sh` |
| DB insert | 1 row por doc | `SELECT COUNT(*)` |
| Validación reject | 100% | Tests 3 y 4 rechazados |

---

## ✅ CHECKLIST FINAL

- [ ] Schema SQL verificado en Neon
- [ ] Credencial OpenAI verificada (ID: gjFJosmeTXLpisjl)
- [ ] Credencial PostgreSQL verificada (ID: SFNQsmuu4zirZAnP)
- [ ] Workflow importado a n8n
- [ ] 9 nodos presentes y conectados
- [ ] Workflow activado
- [ ] Test manual exitoso
- [ ] Test con script exitoso (4 tests)
- [ ] Documento en base de datos (embedding 1536d)
- [ ] Validación rechaza inputs inválidos

---

## 📞 SOPORTE

Si hay errores:

1. **Revisar logs de n8n:**
   - UI → Executions → Ver último execution
   - Click en nodo fallido → Ver error

2. **Errores comunes:**
   - `401 Unauthorized` → API key de OpenAI inválida
   - `connection refused` → Credencial PostgreSQL incorrecta
   - `relation "rag_documents" does not exist` → Schema no creado
   - `type "rag_source_type" does not exist` → ENUMs no creados

3. **Archivos de ayuda:**
   - `database/rag/step_02_create_schema.sql` → Crear schema
   - `database/rag/01_verify_schema.sql` → Verificar schema
   - `tests/test_rag01.sh` → Test automático

---

**Implementador:** Qwen Code  
**Versión del plan:** 1.0  
**Última actualización:** 2026-03-07
