-- ============================================================================
-- BOOKING INTENTS TABLE
-- ============================================================================
-- Propósito: Cola de reservas pendientes para procesamiento asíncrono
-- 
-- Arquitectura:
--   WF1 (Gateway) → Inserta en booking_intents (status: PENDING)
--   WF8 (Worker) → Procesa pendientes cada 30s
--
-- Beneficios:
--   - Elimina timeouts bajo carga pesada
--   - Permite procesamiento por lotes
--   - Facilita reintentos automáticos
--   - Proporciona métricas claras de cola
-- ============================================================================

-- Crear tabla principal
CREATE TABLE IF NOT EXISTS booking_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id INT NOT NULL,
  service_id INT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INT DEFAULT 60,
  customer_id TEXT,
  chat_id BIGINT,
  user_id BIGINT,
  event_title TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  gcal_event_id TEXT,
  booking_id INT,
  error_message TEXT,
  error_code TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_booking_intents_status ON booking_intents(status);
CREATE INDEX IF NOT EXISTS idx_booking_intents_created ON booking_intents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_intents_idempotency ON booking_intents(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_booking_intents_provider_time ON booking_intents(provider_id, start_time);
CREATE INDEX IF NOT EXISTS idx_booking_intents_pending_updated ON booking_intents(created_at) WHERE status = 'PENDING';

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_booking_intents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_intents_updated ON booking_intents;
CREATE TRIGGER trg_booking_intents_updated
  BEFORE UPDATE ON booking_intents
  FOR EACH ROW
  EXECUTE FUNCTION update_booking_intents_updated_at();

-- ============================================================================
-- VISTAS DE MONITOREO
-- ============================================================================

-- Vista: Cola actual (pendientes por procesar)
CREATE OR REPLACE VIEW v_booking_queue AS
SELECT 
  id,
  provider_id,
  service_id,
  start_time,
  customer_id,
  chat_id,
  status,
  retry_count,
  max_retries,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 AS minutes_in_queue
FROM booking_intents
WHERE status IN ('PENDING', 'PROCESSING')
ORDER BY created_at ASC;

-- Vista: Métricas de procesamiento (últimas 24h)
CREATE OR REPLACE VIEW v_booking_metrics_24h AS
SELECT 
  status,
  COUNT(*) AS total_count,
  COUNT(DISTINCT DATE(created_at)) AS unique_days,
  AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) AS avg_processing_latency_seconds,
  MIN(created_at) AS oldest_in_period,
  MAX(created_at) AS newest_in_period
FROM booking_intents
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Vista: Errores recientes para debugging
CREATE OR REPLACE VIEW v_booking_errors_recent AS
SELECT 
  id,
  provider_id,
  service_id,
  start_time,
  customer_id,
  chat_id,
  error_code,
  error_message,
  retry_count,
  created_at,
  processed_at
FROM booking_intents
WHERE status = 'FAILED'
  AND updated_at >= NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC
LIMIT 50;

-- ============================================================================
-- FUNCIONES UTILITARIAS
-- ============================================================================

-- Función: Obtener siguientes N pendientes para procesar
CREATE OR REPLACE FUNCTION fn_booking_get_pending(limit_count INT DEFAULT 5)
RETURNS TABLE (
  intent_id UUID,
  provider_id INT,
  service_id INT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INT,
  customer_id TEXT,
  chat_id BIGINT,
  user_id BIGINT,
  event_title TEXT,
  idempotency_key TEXT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    bi.id,
    bi.provider_id,
    bi.service_id,
    bi.start_time,
    bi.end_time,
    bi.duration_minutes,
    bi.customer_id,
    bi.chat_id,
    bi.user_id,
    bi.event_title,
    bi.idempotency_key,
    bi.metadata
  FROM booking_intents bi
  WHERE bi.status = 'PENDING'
    AND bi.retry_count < bi.max_retries
    AND bi.created_at <= NOW() - INTERVAL '30 seconds'  -- Evitar procesar muy pronto
  ORDER BY bi.created_at ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Función: Marcar intento como procesando
CREATE OR REPLACE FUNCTION fn_booking_mark_processing(intent_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE booking_intents
  SET status = 'PROCESSING',
      updated_at = NOW()
  WHERE id = intent_id
    AND status = 'PENDING';
    
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Función: Marcar como completado
CREATE OR REPLACE FUNCTION fn_booking_mark_completed(
  intent_id UUID,
  booking_id_param INT,
  gcal_event_id_param TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE booking_intents
  SET status = 'COMPLETED',
      booking_id = booking_id_param,
      gcal_event_id = gcal_event_id_param,
      processed_at = NOW(),
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = intent_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Función: Marcar como fallido (con reintento)
CREATE OR REPLACE FUNCTION fn_booking_mark_failed(
  intent_id UUID,
  error_code_param TEXT,
  error_message_param TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  new_retry_count INT;
  max_retries_val INT;
BEGIN
  -- Obtener retry count actual
  SELECT retry_count, max_retries INTO new_retry_count, max_retries_val
  FROM booking_intents
  WHERE id = intent_id;
  
  new_retry_count := new_retry_count + 1;
  
  IF new_retry_count >= max_retries_val THEN
    -- Max retries alcanzado, marcar como FAILED permanentemente
    UPDATE booking_intents
    SET status = 'FAILED',
        error_code = error_code_param,
        error_message = error_message_param,
        retry_count = new_retry_count,
        processed_at = NOW(),
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = intent_id;
  ELSE
    -- Reintentar más tarde (resetear a PENDING)
    UPDATE booking_intents
    SET status = 'PENDING',
        error_code = error_code_param,
        error_message = error_message_param,
        retry_count = new_retry_count,
        updated_at = NOW()
    WHERE id = intent_id;
  END IF;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DATOS DE EJEMPLO (PARA TESTING)
-- ============================================================================

-- Insertar un intento de ejemplo (descomentar para testing)
/*
INSERT INTO booking_intents (
  provider_id,
  service_id,
  start_time,
  customer_id,
  chat_id,
  idempotency_key,
  status
) VALUES (
  1,
  1,
  '2026-03-25T14:00:00Z',
  'test_customer_001',
  5391760292,
  'booking_1_1_2026-03-25T14:00:00Z_test_customer_001',
  'PENDING'
);
*/

-- ============================================================================
-- CONSULTAS DE MONITOREO ÚTILES
-- ============================================================================

-- Ver cola actual:
-- SELECT * FROM v_booking_queue;

-- Ver métricas últimas 24h:
-- SELECT * FROM v_booking_metrics_24h;

-- Ver errores recientes:
-- SELECT * FROM v_booking_errors_recent;

-- Ver intents por procesar (próximos 5):
-- SELECT * FROM fn_booking_get_pending(5);

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
