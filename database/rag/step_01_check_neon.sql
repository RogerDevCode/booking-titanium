-- ============================================================
-- RAG IMPLEMENTATION FOR BOOKING TITANIUM
-- Step D: Neon Compatibility Check
-- ============================================================
-- Run this script in Neon Console or via psql to verify compatibility
-- ============================================================

-- 1. Check PostgreSQL version (required: 15+)
SELECT 
  version() AS postgres_version,
  split_part(version(), ' ', 2) AS version_string,
  CASE 
    WHEN split_part(version(), ' ', 2) >= '15' THEN '✅ COMPATIBLE'
    ELSE '❌ UPGRADE REQUIRED (PostgreSQL 15+ needed)'
  END AS compatibility_status;

-- 2. Check if pgvector extension is available
SELECT 
  name,
  default_version,
  installed_version,
  CASE 
    WHEN installed_version IS NOT NULL THEN '✅ INSTALLED'
    WHEN default_version IS NOT NULL THEN '⚠️  AVAILABLE (run: CREATE EXTENSION vector;)'
    ELSE '❌ NOT AVAILABLE (pgvector not supported on this plan)'
  END AS status
FROM pg_available_extensions
WHERE name = 'vector';

-- 3. Check available extensions (search for vector-related)
SELECT name, default_version, comment
FROM pg_available_extensions
WHERE name ILIKE '%vector%' OR comment ILIKE '%vector%';

-- 4. Check current database size (for capacity planning)
SELECT 
  pg_database_size(current_database()) AS size_bytes,
  pg_size_pretty(pg_database_size(current_database())) AS size_pretty;

-- 5. Check if you have superuser or extension creation privileges
SELECT 
  current_user,
  current_setting('is_superuser') AS is_superuser,
  has_database_privilege(current_database(), 'CREATE') AS has_create_privilege;

-- 6. Check shared_preload_libraries (required for some extensions)
SELECT current_setting('shared_preload_libraries') AS preload_libraries;

-- ============================================================
-- INTERPRETATION GUIDE
-- ============================================================
-- 
-- ✅ ALL GREEN LIGHT:
--   - PostgreSQL 15+ → Proceed with schema creation
--   - pgvector installed or available → Proceed
--   - Has CREATE privilege → Can create tables/indexes
--
-- ⚠️  WARNING:
--   - pgvector available but not installed → Run: CREATE EXTENSION vector;
--   - PostgreSQL 14 → May work with limited pgvector features
--
-- ❌ BLOCKING ISSUES:
--   - PostgreSQL < 14 → Upgrade required
--   - pgvector not available → Contact Neon support or upgrade plan
--   - No CREATE privilege → Request permission or use different DB
--
-- ============================================================
-- NEXT STEPS AFTER VERIFICATION
-- ============================================================
-- If all checks pass, run: step_02_create_schema.sql
-- ============================================================
