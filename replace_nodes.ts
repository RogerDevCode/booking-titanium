import * as fs from 'fs';

const raw = fs.readFileSync('WF2_base.json', 'utf-8');
const wf = JSON.parse(raw);

const REPLACEMENTS: Record<string, string> = {
  'Check Availability': 'zdUslfT9C0sTI83H',
  'Acquire Lock': 'fhjJXp5DWLjbsem1',
  'Check Circuit Breaker': '6RDslq06ZS78Zph1',
  'Record GCal Success': 'bT0r2EmUqGjc6Ioz'
};

wf.nodes = wf.nodes.map((node: any) => {
  if (REPLACEMENTS[node.name]) {
    const workflowId = REPLACEMENTS[node.name];
    console.log(`Replacing ${node.name} with Execute Workflow (${workflowId})`);
    
    return {
      parameters: {
        source: 'database',
        workflowId: {
          __rl: true,
          value: workflowId,
          mode: 'id'
        },
        mode: 'each',
        options: {}
      },
      name: node.name,
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1,
      position: node.position,
      id: node.id
    };
  }
  return node;
});

// Clean the final payload
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

fs.writeFileSync('WF2_replaced.json', JSON.stringify(cleaned, null, 2));
console.log('Replaced all internal HTTP calls with Execute Workflow nodes (with source: database).');
