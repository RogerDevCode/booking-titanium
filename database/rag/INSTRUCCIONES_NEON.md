# 📋 INSTRUCCIONES PARA EJECUTAR EN NEON CONSOLE

---

## PASO 1: ABRIR NEON CONSOLE

1. Ir a: **https://console.neon.tech/**
2. Iniciar sesión
3. Seleccionar tu proyecto de Booking Titanium
4. Click en **"SQL Editor"** o **"Open Editor"**

---

## PASO 2: VERIFICAR SCHEMA

**Copiar y pegar este SQL en el editor:**

```sql
-- 1. Verificar extensión vector (pgvector)
SELECT 
  extname AS extension_name,
  extversion AS version,
  CASE WHEN extversion IS NOT NULL THEN '✅ vector extension OK' ELSE '❌ FALTA EXTENSIÓN' END AS status
FROM pg_extension 
WHERE extname = 'vector';

-- 2. Verificar tipos ENUM
SELECT 
  typname AS type_name,
  '✅ ENUM type exists' AS status
FROM pg_type 
WHERE typname IN ('rag_source_type', 'rag_document_status');

-- 3. Verificar tabla rag_documents
SELECT 
  tablename,
  '✅ Table exists' AS status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'rag_documents';

-- 4. Contar documentos existentes
SELECT COUNT(*) AS existing_documents FROM rag_documents;
```

**Click en "Run" o presionar Ctrl+Enter**

---

## PASO 3: INTERPRETAR RESULTADOS

### ✅ SI TODO ESTÁ BIEN:

Deberías ver:

```
extension_name: vector
version: 0.7.0 o superior
status: ✅ vector extension OK

type_name: rag_source_type
status: ✅ ENUM type exists

type_name: rag_document_status
status: ✅ ENUM type exists

tablename: rag_documents
status: ✅ Table exists

existing_documents: 0 (o más si ya hay datos)
```

**→ Ir al PASO 4**

### ❌ SI FALTA ALGO:

**Si "vector extension" no aparece:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Si los ENUMs no aparecen:**
```sql
-- Ejecutar el schema completo
-- (archivo: database/rag/step_02_create_schema.sql)
-- Copiar todo el contenido y pegar en Neon Console
```

**Si la tabla no existe:**
```sql
-- Ejecutar el schema completo
-- (archivo: database/rag/step_02_create_schema.sql)
```

---

## PASO 4: COPIAR CONEXIÓN STRING

**En Neon Console:**

1. Ir a **"Connection Details"** (en el dashboard del proyecto)
2. Copiar **Connection string** (formato psql)
3. Guardar para usar en n8n

**Formato esperado:**
```
postgresql://neondb_owner:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

---

## PASO 5: VERIFICAR EN N8N

**En n8n.stax.ink:**

1. Ir a **Credentials**
2. Buscar **"Postgres account"**
3. Verificar que el ID es: `SFNQsmuu4zirZAnP`
4. Click en **"Test Connection"**
5. Debería retornar: **✅ Connection successful**

---

## 📞 SI HAY ERRORES

### Error: "relation 'rag_documents' does not exist"

**Solución:**
1. Abrir archivo: `database/rag/step_02_create_schema.sql`
2. Copiar TODO el contenido
3. Pegar en Neon Console
4. Ejecutar

### Error: "type 'vector' does not exist"

**Solución:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Error: "permission denied"

**Solución:**
- Verificar que estás usando el rol correcto (neondb_owner)
- Contactar al administrador de la base de datos

---

## ✅ CHECKLIST COMPLETADO

Marcar cuando esté completo:

- [ ] ✅ Extensión vector instalada (v0.7+)
- [ ] ✅ Tipo `rag_source_type` existe
- [ ] ✅ Tipo `rag_document_status` existe
- [ ] ✅ Tabla `rag_documents` existe
- [ ] ✅ Connection string copiado de Neon
- [ ] ✅ Credencial PostgreSQL en n8n verificada

---

**Una vez completado:** Proceder con la importación del workflow RAG_01 a n8n.
