-- scripts-ts/rag_init_db.sql
-- Inicialización de base de datos para RAG (pgvector)
-- Ejecutar en Neon Console o con psql

-- ============================================================================
-- 1. HABILITAR EXTENSIÓN PGVECTOR
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. CREAR TIPOS ENUM
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE rag_source_type AS ENUM ('manual', 'web', 'document', 'api', 'import');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE rag_document_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. CREAR TABLA rag_documents
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag_documents (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL,
    service_id INTEGER,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    embedding vector(1536) NOT NULL,
    source_type rag_source_type NOT NULL DEFAULT 'manual',
    status rag_document_status NOT NULL DEFAULT 'published',
    language VARCHAR(10) NOT NULL DEFAULT 'es',
    metadata JSONB DEFAULT '{}',
    chunk_index INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. ÍNDICES PARA BÚSQUEDA
-- ============================================================================

-- Índice para filtrar por provider
CREATE INDEX IF NOT EXISTS idx_rag_documents_provider_id ON rag_documents(provider_id);

-- Índice para filtrar por service
CREATE INDEX IF NOT EXISTS idx_rag_documents_service_id ON rag_documents(service_id);

-- Índice para filtrar por status
CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(status);

-- Índice para búsqueda por similitud (ivfflat)
CREATE INDEX IF NOT EXISTS idx_rag_documents_embedding 
ON rag_documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- 5. FUNCIÓN hybrid_search_rag_documents
-- ============================================================================

CREATE OR REPLACE FUNCTION hybrid_search_rag_documents(
    query_embedding vector(1536),
    search_provider_id INTEGER,
    query_text TEXT DEFAULT '',
    search_filters JSONB DEFAULT NULL,
    result_limit INTEGER DEFAULT 5,
    similarity_threshold FLOAT DEFAULT 0.2
)
RETURNS TABLE (
    id INTEGER,
    provider_id INTEGER,
    service_id INTEGER,
    title VARCHAR,
    content TEXT,
    summary TEXT,
    similarity FLOAT,
    source_type rag_source_type,
    status rag_document_status,
    language VARCHAR,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id::INTEGER,
        d.provider_id,
        d.service_id,
        d.title,
        d.content,
        d.summary,
        (1 - (d.embedding <=> query_embedding))::FLOAT AS similarity,
        d.source_type,
        d.status,
        d.language,
        d.metadata,
        d.created_at
    FROM rag_documents d
    WHERE 
        -- Filtro por provider
        (search_provider_id IS NULL OR d.provider_id = search_provider_id)
        -- Filtro por status (solo published)
        AND d.status = 'published'::rag_document_status
        -- Filtro por similitud mínima
        AND (1 - (d.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY 
        d.embedding <=> query_embedding
    LIMIT result_limit;
END;
$$;

-- ============================================================================
-- 6. VERIFICACIÓN
-- ============================================================================

-- Mostrar tablas creadas
SELECT 'Tablas creadas:' AS info;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'rag%';

-- Mostrar tipos creados
SELECT 'Tipos ENUM creados:' AS info;
SELECT typname FROM pg_type WHERE typtype = 'e';

-- Mostrar función creada
SELECT 'Función creada:' AS info;
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'hybrid_search_rag_documents';
