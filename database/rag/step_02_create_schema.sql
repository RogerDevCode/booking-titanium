-- ============================================================
-- RAG IMPLEMENTATION FOR BOOKING TITANIUM
-- Step A: Complete Schema Creation
-- ============================================================
-- Database: Neon Tech (PostgreSQL 15+ with pgvector)
-- Single tenant, multi-provider architecture
-- ============================================================

-- ============================================================
-- 1. ENABLE EXTENSIONS
-- ============================================================

-- Enable pgvector extension (required for vector similarity search)
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify extension was created
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- ============================================================
-- 2. CREATE ENUMS FOR TYPE SAFETY
-- ============================================================

-- Document source types (where does this information come from?)
CREATE TYPE rag_source_type AS ENUM (
  'faq',           -- Frequently asked questions
  'policy',        -- Clinic policies
  'schedule',      -- Scheduling rules
  'service',       -- Service descriptions
  'provider',      -- Provider information
  'insurance',     -- Insurance information
  'pricing',       -- Price lists
  'preparation',   -- Pre-appointment instructions
  'post_care',     -- Post-appointment care
  'emergency',     -- Emergency procedures
  'other'          -- Other documentation
);

-- Document status (lifecycle management)
CREATE TYPE rag_document_status AS ENUM (
  'draft',         -- Not yet published
  'published',     -- Active and searchable
  'archived',      -- Historical, not searchable
  'expired'        -- Time-limited content that expired
);

-- ============================================================
-- 3. CREATE MAIN RAG DOCUMENTS TABLE
-- ============================================================

CREATE TABLE rag_documents (
  -- Primary key
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Multi-tenant isolation (critical for n8n retrieval)
  provider_id   INTEGER NOT NULL,          -- FK to providers table
  service_id    INTEGER,                   -- NULL = applies to all services of provider
  
  -- Content
  title         VARCHAR(500) NOT NULL,     -- Document title
  content       TEXT NOT NULL,             -- Text chunk for embedding
  summary       TEXT,                      -- Optional summary for quick preview
  
  -- Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
  embedding     vector(1536),
  
  -- Metadata (structured + flexible)
  source_type   rag_source_type NOT NULL DEFAULT 'other',
  status        rag_document_status NOT NULL DEFAULT 'draft',
  language      VARCHAR(5) NOT NULL DEFAULT 'es',  -- ISO 639-1 (es, en, pt, fr)
  metadata      JSONB NOT NULL DEFAULT '{}',
  -- Recommended metadata keys:
  -- { "version": "1.0", "author": "admin", "review_date": "2026-12-31", "tags": ["urgent", "faq"] }
  
  -- Lifecycle timestamps
  published_at  TIMESTAMPTZ,               -- When became searchable
  expires_at    TIMESTAMPTZ,               -- When content expires (NULL = never)
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  deleted_at    TIMESTAMPTZ,               -- Soft delete (NULL = active)
  
  -- Constraints
  CONSTRAINT chk_provider_positive CHECK (provider_id > 0),
  CONSTRAINT chk_service_positive CHECK (service_id IS NULL OR service_id > 0),
  CONSTRAINT chk_content_length CHECK (length(content) > 10 AND length(content) < 10000),
  CONSTRAINT chk_language_format CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

-- ============================================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- ============================================================

-- 4.1 HNSW index for Approximate Nearest Neighbor (ANN) vector search
-- Parameters: m=16 (connections), ef_construction=64 (build quality)
CREATE INDEX rag_hnsw_idx
  ON rag_documents
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4.2 B-tree indexes for metadata filtering (pre-filtering before vector search)
CREATE INDEX rag_provider_idx ON rag_documents (provider_id);
CREATE INDEX rag_service_idx ON rag_documents (service_id);
CREATE INDEX rag_source_type_idx ON rag_documents (source_type);
CREATE INDEX rag_status_idx ON rag_documents (status);
CREATE INDEX rag_language_idx ON rag_documents (language);

-- 4.3 Partial index for active documents only (optimizes common query pattern)
CREATE INDEX rag_active_idx 
  ON rag_documents (provider_id, service_id)
  WHERE status = 'published' AND deleted_at IS NULL;

-- 4.4 GIN index for JSONB metadata queries
CREATE INDEX rag_metadata_idx ON rag_documents USING gin (metadata);

-- 4.5 GIN index for full-text search (hybrid search support)
CREATE INDEX rag_fts_idx 
  ON rag_documents 
  USING gin (to_tsvector('spanish', content));

-- 4.6 Index for expiration checking (time-based cleanup)
CREATE INDEX rag_expires_idx ON rag_documents (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX rag_deleted_idx ON rag_documents (deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 5. CREATE HELPER FUNCTIONS
-- ============================================================

-- 5.1 Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rag_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rag_documents_updated_at
  BEFORE UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_rag_documents_updated_at();

-- 5.2 Auto-set published_at when status changes to 'published'
CREATE OR REPLACE FUNCTION set_rag_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status != 'published' THEN
    NEW.published_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rag_published_at
  BEFORE UPDATE ON rag_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_rag_published_at();

-- 5.3 Similarity search function (with pre-filtering)
CREATE OR REPLACE FUNCTION search_rag_documents(
  p_embedding vector(1536),
  p_provider_id INTEGER,
  p_service_id INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  content TEXT,
  summary TEXT,
  source_type rag_source_type,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.content,
    d.summary,
    d.source_type,
    d.metadata,
    1 - (d.embedding <=> p_embedding) AS similarity
  FROM rag_documents d
  WHERE d.status = 'published'
    AND d.deleted_at IS NULL
    AND (d.expires_at IS NULL OR d.expires_at > now())
    AND d.provider_id = p_provider_id
    AND (p_service_id IS NULL OR d.service_id IS NULL OR d.service_id = p_service_id)
    AND 1 - (d.embedding <=> p_embedding) >= p_similarity_threshold
  ORDER BY d.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 5.4 Hybrid search function (vector + full-text)
CREATE OR REPLACE FUNCTION hybrid_search_rag_documents(
  p_embedding vector(1536),
  p_provider_id INTEGER,
  p_search_query TEXT DEFAULT NULL,
  p_service_id INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 5,
  p_similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  title VARCHAR,
  content TEXT,
  summary TEXT,
  source_type rag_source_type,
  metadata JSONB,
  similarity FLOAT,
  text_rank FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.title,
    d.content,
    d.summary,
    d.source_type,
    d.metadata,
    1 - (d.embedding <=> p_embedding) AS similarity,
    CASE 
      WHEN p_search_query IS NOT NULL THEN
        ts_rank(to_tsvector('spanish', d.content), plainto_tsquery('spanish', p_search_query))
      ELSE 0
    END AS text_rank
  FROM rag_documents d
  WHERE d.status = 'published'
    AND d.deleted_at IS NULL
    AND (d.expires_at IS NULL OR d.expires_at > now())
    AND d.provider_id = p_provider_id
    AND (p_service_id IS NULL OR d.service_id IS NULL OR d.service_id = p_service_id)
    AND 1 - (d.embedding <=> p_embedding) >= p_similarity_threshold
    AND (p_search_query IS NULL OR to_tsvector('spanish', d.content) @@ plainto_tsquery('spanish', p_search_query))
  ORDER BY 
    -- Weighted ranking: 70% vector similarity, 30% text relevance
    (0.7 * (1 - (d.embedding <=> p_embedding))) + 
    (0.3 * CASE 
      WHEN p_search_query IS NOT NULL THEN
        ts_rank(to_tsvector('spanish', d.content), plainto_tsquery('spanish', p_search_query))
      ELSE 0
    END) DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. CREATE SEED DATA (EXAMPLE DOCUMENTS)
-- ============================================================

-- Example FAQ documents for testing
INSERT INTO rag_documents (provider_id, service_id, title, content, summary, source_type, status, language, metadata) VALUES
(1, NULL, 'Horarios de Atención', 
 'Nuestra clínica atiende de lunes a viernes de 8:00 AM a 8:00 PM, y sábados de 9:00 AM a 2:00 PM. Los domingos y festivos estamos cerrados. Para emergencias fuera de horario, por favor diríjase al hospital más cercano.',
 'Horarios de atención de la clínica',
 'schedule', 'published', 'es', '{"version": "1.0", "author": "admin"}'),

(1, NULL, 'Política de Cancelación',
 'Las reservas pueden cancelarse sin cargo hasta 24 horas antes de la cita. Cancelaciones con menos de 24 horas de anticipación tendrán un cargo del 50% del valor de la consulta. No-shows (no presentarse) serán cobrados al 100%.',
 'Política de cancelación de reservas',
 'policy', 'published', 'es', '{"version": "2.0", "author": "admin", "review_date": "2026-12-31"}'),

(1, NULL, 'Preparación para Exámenes de Sangre',
 'Para exámenes de sangre que requieren ayuno, debe abstenerse de comer o beber (excepto agua) por 8-12 horas antes del examen. Puede tomar sus medicamentos habituales con agua. Evite alcohol 24 horas antes.',
 'Instrucciones de preparación para exámenes',
 'preparation', 'published', 'es', '{"version": "1.0", "tags": ["ayuno", "laboratorio"]}'),

(1, NULL, 'Formas de Pago Aceptadas',
 'Aceptamos efectivo, tarjetas de crédito (Visa, MasterCard, American Express), tarjetas de débito, y transferencia bancaria. También trabajamos con las principales aseguradoras: Cruz Blanca, Colmena, Banmédica, Nueva Masvida.',
 'Métodos de pago y aseguradoras',
 'pricing', 'published', 'es', '{"version": "1.5", "author": "finance"}'),

(1, NULL, 'Qué Hacer en Caso de Emergencia',
 'En caso de emergencia médica fuera de nuestro horario, diríjase inmediatamente a la urgencia hospitalaria más cercana o llame al 131 (SAMU). No espere a que abramos. Su salud es prioridad.',
 'Instrucciones para emergencias',
 'emergency', 'published', 'es', '{"version": "1.0", "urgent": true}');

-- ============================================================
-- 7. CREATE VIEWS FOR COMMON QUERIES
-- ============================================================

-- View: Active published documents
CREATE VIEW v_rag_active_documents AS
SELECT 
  id, provider_id, service_id, title, summary, source_type, language, metadata, published_at
FROM rag_documents
WHERE status = 'published' 
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > now());

-- View: Documents expiring soon (next 30 days)
CREATE VIEW v_rag_expiring_soon AS
SELECT 
  id, provider_id, title, source_type, expires_at,
  (expires_at - now()) AS days_remaining
FROM rag_documents
WHERE expires_at IS NOT NULL
  AND expires_at <= now() + INTERVAL '30 days'
  AND expires_at > now()
  AND deleted_at IS NULL;

-- View: Document statistics by provider
CREATE VIEW v_rag_stats AS
SELECT 
  provider_id,
  COUNT(*) FILTER (WHERE status = 'published' AND deleted_at IS NULL) AS published_count,
  COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
  COUNT(*) FILTER (WHERE status = 'archived') AS archived_count,
  COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > now()) AS expiring_count,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_count
FROM rag_documents
GROUP BY provider_id;

-- ============================================================
-- 8. GRANT PERMISSIONS (adjust for your setup)
-- ============================================================

-- If you have separate read/write users:
-- GRANT SELECT ON v_rag_active_documents TO n8n_read_user;
-- GRANT SELECT, INSERT, UPDATE ON rag_documents TO n8n_write_user;
-- GRANT EXECUTE ON FUNCTION search_rag_documents TO n8n_read_user;
-- GRANT EXECUTE ON FUNCTION hybrid_search_rag_documents TO n8n_read_user;

-- ============================================================
-- 9. VERIFICATION QUERIES
-- ============================================================

-- Check table was created
SELECT COUNT(*) AS document_count FROM rag_documents;

-- Check indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'rag_documents' 
ORDER BY indexname;

-- Check functions
SELECT routine_name, data_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE 'search_rag%' OR routine_name LIKE 'hybrid_search_rag%'
ORDER BY routine_name;

-- Test search function (with NULL embedding - will return empty)
-- SELECT * FROM search_rag_documents(array_fill(0, 1536)::vector, 1);

-- ============================================================
-- SCHEMA CREATION COMPLETE
-- ============================================================
-- Next step: Create n8n workflows for ingestion and retrieval
-- ============================================================
