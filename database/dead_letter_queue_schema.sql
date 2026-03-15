-- Dead Letter Queue Schema for Failed Bookings
-- Used by: DLQ_Manager workflow

CREATE TABLE IF NOT EXISTS booking_dlq (
    dlq_id BIGSERIAL PRIMARY KEY,
    booking_id INT,
    idempotency_key TEXT,
    provider_id INT,
    service_id INT,
    start_time TIMESTAMPTZ,
    customer_id TEXT,
    chat_id TEXT,
    failure_reason TEXT NOT NULL,
    failure_count INT NOT NULL DEFAULT 1,
    last_error_message TEXT,
    last_error_stack TEXT,
    original_payload JSONB NOT NULL,
    context_data JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, retrying, resolved, discarded
    first_failed_at TIMESTAMPTZ DEFAULT NOW(),
    last_failed_at TIMESTAMPTZ DEFAULT NOW(),
    next_retry_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT, -- 'auto_retry', 'manual', 'timeout'
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_booking_dlq_status ON booking_dlq(status);
CREATE INDEX IF NOT EXISTS idx_booking_dlq_next_retry ON booking_dlq(next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_booking_dlq_idempotency ON booking_dlq(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_booking_dlq_failed_at ON booking_dlq(first_failed_at);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_booking_dlq_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trg_update_booking_dlq_timestamp ON booking_dlq;
CREATE TRIGGER trg_update_booking_dlq_timestamp
    BEFORE UPDATE ON booking_dlq
    FOR EACH ROW
    EXECUTE FUNCTION update_booking_dlq_timestamp();

-- View for monitoring DLQ
CREATE OR REPLACE VIEW v_booking_dlq_status AS
SELECT 
    status,
    COUNT(*) as count,
    MIN(first_failed_at) as oldest_failure,
    MAX(last_failed_at) as most_recent_failure,
    AVG(failure_count) as avg_failure_count
FROM booking_dlq
GROUP BY status;

-- View for items ready for retry
CREATE OR REPLACE VIEW v_booking_dlq_ready_for_retry AS
SELECT *
FROM booking_dlq
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY first_failed_at ASC;

-- Function to add item to DLQ
CREATE OR REPLACE FUNCTION booking_dlq_add(
    p_booking_id INT,
    p_idempotency_key TEXT,
    p_provider_id INT,
    p_service_id INT,
    p_start_time TIMESTAMPTZ,
    p_customer_id TEXT,
    p_chat_id TEXT,
    p_failure_reason TEXT,
    p_error_message TEXT,
    p_error_stack TEXT,
    p_original_payload JSONB,
    p_context_data JSONB
)
RETURNS BIGINT AS $$
DECLARE
    v_dlq_id BIGINT;
    v_existing_count INT;
BEGIN
    -- Check if this idempotency_key already exists in DLQ
    SELECT failure_count INTO v_existing_count
    FROM booking_dlq
    WHERE idempotency_key = p_idempotency_key
      AND status = 'pending'
    LIMIT 1;
    
    IF v_existing_count IS NOT NULL THEN
        -- Update existing entry
        UPDATE booking_dlq
        SET failure_count = failure_count + 1,
            last_error_message = p_error_message,
            last_error_stack = p_error_stack,
            last_failed_at = NOW(),
            next_retry_at = CASE 
                WHEN failure_count + 1 >= 5 THEN NULL -- Max retries reached
                ELSE NOW() + (POWER(2, failure_count + 1) || ' minutes')::INTERVAL -- Exponential backoff
            END,
            original_payload = p_original_payload,
            context_data = p_context_data
        WHERE idempotency_key = p_idempotency_key
          AND status = 'pending'
        RETURNING dlq_id INTO v_dlq_id;
    ELSE
        -- Insert new entry
        INSERT INTO booking_dlq (
            booking_id, idempotency_key, provider_id, service_id, start_time,
            customer_id, chat_id, failure_reason, last_error_message, last_error_stack,
            original_payload, context_data, next_retry_at
        ) VALUES (
            p_booking_id, p_idempotency_key, p_provider_id, p_service_id, p_start_time,
            p_customer_id, p_chat_id, p_failure_reason, p_error_message, p_error_stack,
            p_original_payload, p_context_data,
            NOW() + (POWER(2, 1) || ' minutes')::INTERVAL -- First retry in 2 minutes
        )
        RETURNING dlq_id INTO v_dlq_id;
    END IF;
    
    RETURN v_dlq_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark DLQ item as resolved
CREATE OR REPLACE FUNCTION booking_dlq_resolve(
    p_dlq_id BIGINT,
    p_resolution_by TEXT,
    p_resolution_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE booking_dlq
    SET status = 'resolved',
        resolved_at = NOW(),
        resolved_by = p_resolution_by,
        resolution_notes = p_resolution_notes
    WHERE dlq_id = p_dlq_id
      AND status != 'resolved';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to discard DLQ item (max retries reached)
CREATE OR REPLACE FUNCTION booking_dlq_discard(
    p_dlq_id BIGINT,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE booking_dlq
    SET status = 'discarded',
        resolved_at = NOW(),
        resolved_by = 'timeout',
        resolution_notes = COALESCE(p_notes, 'Max retries reached')
    WHERE dlq_id = p_dlq_id
      AND status = 'pending';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Insert default configuration
INSERT INTO booking_dlq (status, failure_reason, original_payload, provider_id, service_id)
VALUES ('system', 'DLQ initialized', '{}', 0, 0)
ON CONFLICT DO NOTHING;

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, UPDATE ON booking_dlq TO n8n_user;
-- GRANT USAGE, SELECT ON SEQUENCE booking_dlq_dlq_id_seq TO n8n_user;
