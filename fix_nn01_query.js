const fs = require('fs');
const filePath = 'workflows/DB_Get_Availability.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.nodes.forEach(node => {
  if (node.name === 'Fetch Data from DB') {
    node.parameters.query = `WITH provider_conf AS (
    SELECT s.duration_min, s.buffer_min, p.name as provider_name
    FROM services s
    JOIN provider_services ps ON ps.service_id = s.id
    JOIN providers p ON p.id = ps.provider_id
    WHERE p.id = {{ $json.provider_id }} AND s.id = {{ $json.service_id }}
    LIMIT 1
),
schedule AS (
    SELECT start_time, end_time 
    FROM provider_schedules 
    WHERE provider_id = {{ $json.provider_id }} 
    AND day_of_week = EXTRACT(DOW FROM '{{ $json.date }}'::date)
    LIMIT 1
),
existing_bookings AS (
    SELECT start_time, end_time 
    FROM bookings 
    WHERE provider_id = {{ $json.provider_id }} 
    AND status = 'CONFIRMED'
    AND start_time::date = '{{ $json.date }}'::date
)
SELECT 
    (SELECT row_to_json(provider_conf) FROM provider_conf) as config,
    (SELECT row_to_json(schedule) FROM schedule) as day_schedule,
    COALESCE((SELECT json_agg(existing_bookings) FROM existing_bookings), '[]'::json) as current_bookings;`;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
