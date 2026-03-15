const fs = require('fs');

const path = './workflows/seed/cb_gcal_circuit_breaker.json';
const wf = JSON.parse(fs.readFileSync(path, 'utf8'));

const recordNode = wf.nodes.find(n => n.name === 'Record Result');
if (recordNode) {
  recordNode.parameters.query = `INSERT INTO circuit_breaker_state (
    service_id, service_name, state, failure_count, success_count, 
    last_failure_at, last_success_at, opened_at, last_error_message
)
VALUES (
    $1::text, 
    $1::text, 
    CASE WHEN $2::text = 'failure' THEN 'open' ELSE 'closed' END,
    CASE WHEN $2::text = 'failure' THEN 1 ELSE 0 END, 
    CASE WHEN $2::text = 'success' THEN 1 ELSE 0 END, 
    CASE WHEN $2::text = 'failure' THEN NOW() ELSE NULL END,
    CASE WHEN $2::text = 'success' THEN NOW() ELSE NULL END,
    CASE WHEN $2::text = 'failure' THEN NOW() ELSE NULL END,
    CASE WHEN $2::text = 'failure' THEN $3::text ELSE NULL END
)
ON CONFLICT (service_id) DO UPDATE SET 
    failure_count = CASE 
      WHEN $2::text = 'success' THEN 0
      ELSE circuit_breaker_state.failure_count + 1
    END,
    success_count = CASE 
      WHEN $2::text = 'success' THEN 
        CASE WHEN circuit_breaker_state.state = 'half-open' THEN circuit_breaker_state.success_count + 1 ELSE 1 END
      ELSE 0
    END,
    state = CASE 
      WHEN $2::text = 'failure' AND circuit_breaker_state.failure_count + 1 >= circuit_breaker_state.failure_threshold THEN 'open'
      WHEN $2::text = 'success' AND circuit_breaker_state.state = 'half-open' AND circuit_breaker_state.success_count + 1 >= circuit_breaker_state.success_threshold THEN 'closed'
      ELSE circuit_breaker_state.state
    END,
    opened_at = CASE 
      WHEN $2::text = 'failure' AND circuit_breaker_state.state != 'open' AND circuit_breaker_state.failure_count + 1 >= circuit_breaker_state.failure_threshold THEN NOW()
      ELSE circuit_breaker_state.opened_at
    END,
    last_failure_at = CASE WHEN $2::text = 'failure' THEN NOW() ELSE circuit_breaker_state.last_failure_at END,
    last_success_at = CASE WHEN $2::text = 'success' THEN NOW() ELSE circuit_breaker_state.last_success_at END,
    last_error_message = CASE WHEN $2::text = 'failure' THEN $3::text ELSE circuit_breaker_state.last_error_message END
RETURNING *;`;
}

fs.writeFileSync(path, JSON.stringify(wf, null, 2));
console.log('P2 applied: Added UPSERT logic to Record Result node');
