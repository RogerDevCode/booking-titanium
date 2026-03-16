import * as fs from 'fs';

const raw = fs.readFileSync('WF2_base.json', 'utf-8');
const wf = JSON.parse(raw);

const INTERNAL_BASE = 'http://n8n_titanium:5678/webhook';

const HTTP_REPLACEMENTS: Record<string, string> = {
  'Check Availability': `${INTERNAL_BASE}/db-get-availability-test`,
  'Acquire Lock': `${INTERNAL_BASE}/acquire-lock`,
  'Check Circuit Breaker': `${INTERNAL_BASE}/circuit-breaker/check`,
  'Record GCal Success': `${INTERNAL_BASE}/circuit-breaker/record`
};

wf.nodes = wf.nodes.map((node: any) => {
  if (HTTP_REPLACEMENTS[node.name]) {
    const url = HTTP_REPLACEMENTS[node.name];
    console.log(`Optimizing ${node.name} with internal URL: ${url}`);
    
    // Ensure it is a modern HTTP Request node (v4.4)
    return {
      parameters: {
        method: 'POST',
        url: url,
        sendBody: true,
        specifyBody: 'json',
        jsonBody: node.name === 'Check Availability' 
          ? "={{ JSON.stringify({ provider_id: $json.ctx.provider_id, service_id: $json.ctx.service_id, start_time: $json.ctx.start_time }) }}"
          : (node.name === 'Acquire Lock' 
              ? "={{ JSON.stringify({ provider_id: $json.ctx.provider_id, start_time: $json.ctx.start_time, lock_duration_minutes: 1 }) }}"
              : node.parameters.jsonBody),
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

// Clean and Save
const cleaned = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: {
    executionOrder: "v1",
    callerPolicy: "workflowsFromSameOwner",
    availableInMCP: false,
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
    saveExecutionProgress: true,
    saveManualExecutions: true
  }
};

fs.writeFileSync('WF2_internal.json', JSON.stringify(cleaned, null, 2));
console.log('Optimized WF2 with internal Docker URLs and Watchdog pattern.');
