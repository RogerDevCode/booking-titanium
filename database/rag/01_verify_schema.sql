-- ============================================================
-- RAG_01 PRE-REQUISITOS — VERIFICACIÓN DE SCHEMA
-- ============================================================
-- Ejecutar en Neon Console: https://console.neon.tech
-- O vía psql: psql "postgresql://..." -f verify_schema.sql
-- ============================================================

-- 1. Verificar extensión vector (pgvector)
SELECT 
  extname AS extension_name,
  extversion AS version,
  '✅ vector extension' AS status
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

-- 4. Verificar estructura de la tabla
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'rag_documents'
ORDER BY ordinal_position;

-- 5. Verificar índices
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'rag_documents'
ORDER BY indexname;

-- 6. Verificar funciones
SELECT 
  routine_name,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_name LIKE 'search_rag%' OR routine_name LIKE 'hybrid_search_rag%')
ORDER BY routine_name;

-- 7. Contar documentos existentes
SELECT COUNT(*) AS existing_documents FROM rag_documents;

-- ============================================================
-- RESULTADOS ESPERADOS
-- ============================================================
-- ✅ vector extension → version 0.7+
-- ✅ rag_source_type → ENUM type exists
-- ✅ rag_document_status → ENUM type exists
-- ✅ rag_documents → Table exists
-- ✅ 16 columnas en la tabla
-- ✅ 7 índices (HNSW, B-tree, GIN, parciales)
-- ✅ 2 funciones (search_rag_documents, hybrid_search_rag_documents)
-- ============================================================
