-- Circuit Breaker State Table for External Services
-- Used by: CB_GCal_Circuit_Breaker workflow

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    service_id TEXT PRIMARY KEY,           -- e.g., 'google_calendar'
    service_name TEXT NOT NULL,            -- e.g., 'Google Calendar API'
    state TEXT NOT NULL DEFAULT 'closed',  -- 'closed', 'open', 'half-open'
    failure_count INT NOT NULL DEFAULT 0,  -- Consecutive failures
    success_count INT NOT NULL DEFAULT 0,  -- Consecutive successes (for half-open)
    last_failure_at TIMESTAMPTZ,           -- Last failure timestamp
    last_success_at TIMESTAMPTZ,           -- Last success timestamp
    opened_at TIMESTAMPTZ,                 -- When circuit was opened
    half_open_at TIMESTAMPTZ,              -- When circuit entered half-open state
    failure_threshold INT NOT NULL DEFAULT 5,    -- Failures before opening
    success_threshold INT NOT NULL DEFAULT 3,    -- Successes before closing
    timeout_seconds INT NOT NULL DEFAULT 300,    -- Time before trying half-open (5 min)
    last_error_message TEXT,               -- Last error message
    metadata JSONB DEFAULT '{}',           -- Additional metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state ON circuit_breaker_state(state);

-- Insert default GCal circuit breaker if not exists
INSERT INTO circuit_breaker_state (service_id, service_name, failure_threshold, success_threshold, timeout_seconds)
VALUES (
    'google_calendar',
    'Google Calendar API',
    5,    -- Open after 5 consecutive failures
    3,    -- Close after 3 consecutive successes in half-open
    300   -- Try again after 5 minutes
)
ON CONFLICT (service_id) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_circuit_breaker_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp
DROP TRIGGER IF EXISTS trg_update_circuit_breaker_timestamp ON circuit_breaker_state;
CREATE TRIGGER trg_update_circuit_breaker_timestamp
    BEFORE UPDATE ON circuit_breaker_state
    FOR EACH ROW
    EXECUTE FUNCTION update_circuit_breaker_timestamp();

-- View for monitoring
CREATE OR REPLACE VIEW v_circuit_breaker_status AS
SELECT 
    service_id,
    service_name,
    state,
    failure_count,
    success_count,
    CASE 
        WHEN state = 'open' AND opened_at IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (NOW() - opened_at)) / 60, 2) || ' min ago'
        ELSE NULL
    END as opened_ago,
    CASE
        WHEN state = 'open' AND opened_at IS NOT NULL
        THEN CASE
            WHEN NOW() - opened_at > (timeout_seconds || ' seconds')::INTERVAL
            THEN 'READY_FOR_HALF_OPEN'
            ELSE 'WAITING'
        END
        ELSE NULL
    END as timeout_status,
    last_error_message,
    updated_at
FROM circuit_breaker_state;
