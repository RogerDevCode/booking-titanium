import * as fs from 'fs';

const wf2Raw = fs.readFileSync('WF2_current.json', 'utf-8');
const wf2 = JSON.parse(wf2Raw);

const INTERNAL_BASE = 'http://n8n_titanium:5678/webhook';

// Use safe context extraction
const ctx = "$('Generate Idempotency Key').first().json.ctx";

const HTTP_REPLACEMENTS: Record<string, any> = {
  'Check Availability': { 
    url: `${INTERNAL_BASE}/db-get-availability-test`, 
    body: `={{ JSON.stringify({ provider_id: ${ctx}.provider_id, service_id: ${ctx}.service_id, start_time: ${ctx}.start_time }) }}` 
  },
  'Acquire Lock': { 
    url: `${INTERNAL_BASE}/acquire-lock`, 
    body: `={{ JSON.stringify({ provider_id: ${ctx}.provider_id, start_time: ${ctx}.start_time, lock_duration_minutes: 1 }) }}` 
  },
  'Check Circuit Breaker': { 
    url: `${INTERNAL_BASE}/circuit-breaker/check`, 
    body: `={{ JSON.stringify({ service_id: "google_calendar", action: "check" }) }}` 
  },
  'Record GCal Success': { 
    url: `${INTERNAL_BASE}/circuit-breaker/record`, 
    body: `={{ JSON.stringify({ service_id: "google_calendar", success: true }) }}` 
  },
  'Create GCal Event': { 
    url: `${INTERNAL_BASE}/gcal-create-event`, 
    body: `={{ JSON.stringify({ start_time: ${ctx}.start_time, end_time: ${ctx}.end_time || new Date(new Date(${ctx}.start_time).getTime() + (${ctx}.duration_minutes || 60) * 60000).toISOString(), user_name: ${ctx}.user_name || 'Paciente', service_name: 'Reserva', user_email: ${ctx}.user_email || 'paciente@ejemplo.com' }) }}` 
  },
  'Create DB Booking': { 
    url: `${INTERNAL_BASE}/db-create-booking-test`, 
    body: `={{ JSON.stringify({ provider_id: ${ctx}.provider_id, service_id: ${ctx}.service_id, start_time: ${ctx}.start_time, end_time: ${ctx}.end_time || new Date(new Date(${ctx}.start_time).getTime() + (${ctx}.duration_minutes || 60) * 60000).toISOString(), idempotency_key: ${ctx}.idempotency_key, gcal_event_id: $('Create GCal Event').first()?.json?.data?.id || $('Create GCal Event').first()?.json?.id || null, user_id: ${ctx}.user_id || ${ctx}.chat_id }) }}` 
  }
};

wf2.nodes = wf2.nodes.map((node: any) => {
  if (HTTP_REPLACEMENTS[node.name]) {
    const config = HTTP_REPLACEMENTS[node.name];
    console.log(`De-monolithifying ${node.name} -> HTTP Request (${config.url})`);
    
    return {
      parameters: {
        method: 'POST',
        url: config.url,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: config.body,
        options: {
          timeout: 15000
        }
      },
      name: node.name,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.4,
      position: node.position,
      id: node.id,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000
    };
  }
  return node;
});

const wf2Clean = {
  name: wf2.name,
  nodes: wf2.nodes,
  connections: wf2.connections,
  settings: {
    executionOrder: "v1",
    callerPolicy: "workflowsFromSameOwner",
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
    saveExecutionProgress: true,
    saveManualExecutions: true
  }
};

fs.writeFileSync('WF2_demolith.json', JSON.stringify(wf2Clean, null, 2));
console.log('Patched WF2 with robust context tracking.');
