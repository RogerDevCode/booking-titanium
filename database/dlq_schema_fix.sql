-- Create the missing view for DLQ Retry
CREATE OR REPLACE VIEW view_booking_dl_ready_retry AS
SELECT * 
FROM booking_dlq
WHERE status = 'pending'
  AND next_retry_at <= NOW()
  AND failure_count < max_retries;

-- Ensure the stored function handles JSONB input correctly
CREATE OR REPLACE FUNCTION booking_dlq_add(p_payload JSONB)
RETURNS TABLE(dlq_id BIGINT) AS $$
DECLARE
    v_dlq_id BIGINT;
BEGIN
    INSERT INTO booking_dlq (
        booking_id, provider_id, service_id, failure_reason, error_message, 
        error_stack, original_payload, idempotency_key, status, failure_count
    )
    VALUES (
        (p_payload->>'booking_id')::BIGINT,
        (p_payload->>'provider_id')::BIGINT,
        (p_payload->>'service_id')::BIGINT,
        (p_payload->>'failure_reason')::TEXT,
        (p_payload->>'error_message')::TEXT,
        (p_payload->>'error_stack')::TEXT,
        (p_payload->'original_payload')::JSONB,
        (p_payload->>'idempotency_key')::TEXT,
        'pending',
        0
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
        failure_count = booking_dlq.failure_count + 1,
        updated_at = NOW()
    RETURNING id INTO v_dlq_id;

    RETURN QUERY SELECT v_dlq_id;
END;
$$ LANGUAGE plpgsql;
