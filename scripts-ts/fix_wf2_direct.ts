import axios from 'axios';

// Hardcoded credentials for reliability
const N8N_API_URL = 'https://n8n.stax.ink';
const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyOWFkNzhhZC0yOTA3LTRkMTItYTAzYy0zMjZjZTI5YTcxN2MiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNThlMzRiNWItMjQ2My00ZWViLWE3ZDMtY2U5MmRmNjZmMjg2IiwiaWF0IjoxNzczNTk4MTgxfQ.M6PGAjgvj9uFOtOc8elUvO08vLRDEfoDKAMGtFS8IV4';

const HEADERS = {
  'X-N8N-API-KEY': N8N_API_KEY,
  'Content-Type': 'application/json'
};

async function fixCreateDBNode() {
  const workflowId = 'Z7g7DgxXQ61V368P';
  
  try {
    // Get current workflow
    console.log('📥 Downloading workflow...');
    const wfRes = await axios.get(`${N8N_API_URL}/api/v1/workflows/${workflowId}`, { headers: HEADERS });
    const workflow = wfRes.data;
    
    // Find and fix Create DB Booking node
    const createDBNode = workflow.nodes.find((n: any) => n.name === 'Create DB Booking');
    if (!createDBNode) {
      console.error('❌ Create DB Booking node not found');
      return;
    }
    
    console.log('📝 Current parameters:', JSON.stringify(createDBNode.parameters, null, 2));
    
    // Fix: Remove queryReplacement from options, keep only at top level
    if (createDBNode.parameters.options?.queryReplacement) {
      console.log('🗑️  Removing old queryReplacement from options...');
      delete createDBNode.parameters.options.queryReplacement;
    }
    
    // Fix query to use separate placeholder for end_time and handle nullable user_id
    // Use customer_id as string if user_id is 0 or null
    createDBNode.parameters.query = "INSERT INTO bookings (provider_id, service_id, start_time, end_time, idempotency_key, gcal_event_id, user_id, status, created_at) VALUES ($1::int, $2::int, $3::timestamp, $4::timestamp, $5::text, $6::text, COALESCE(NULLIF($7::bigint, 0), 5391760292), 'CONFIRMED', NOW()) RETURNING id;";
    
    // For Postgres node v2.6, queryReplacement goes in options
    createDBNode.parameters.options.queryReplacement = '={{ [$json.ctx.provider_id, $json.ctx.service_id, $json.ctx.start_time, $json.end_time, $json.ctx.idempotency_key, $json.gcal_event_id, $json.user_id] }}';
    
    // Remove top-level queryReplacement (not used by Postgres node)
    delete createDBNode.parameters.queryReplacement;
    
    console.log('✅ Fixed parameters:', JSON.stringify(createDBNode.parameters, null, 2));
    
    // Prepare minimal update payload
    const updatePayload = {
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings
    };
    
    // Try update
    console.log('📤 Updating workflow...');
    const updateRes = await axios.put(
      `${N8N_API_URL}/api/v1/workflows/${workflowId}`,
      updatePayload,
      { headers: HEADERS }
    );
    
    console.log('✅ Workflow updated:', updateRes.data.name);
    
    // Activate
    console.log('🔄 Activating workflow...');
    await axios.post(`${N8N_API_URL}/api/v1/workflows/${workflowId}/activate`, {}, { headers: HEADERS });
    console.log('✅ Workflow activated');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

fixCreateDBNode();
