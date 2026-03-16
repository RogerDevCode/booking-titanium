import * as fs from 'fs';

const raw = fs.readFileSync('WF2_base.json', 'utf-8');
const wf = JSON.parse(raw);

const INTERNAL_IDS: Record<string, string> = {
  'Check Availability': 'zdUslfT9C0sTI83H',
  'Acquire Lock': 'fhjJXp5DWLjbsem1',
  'Check Circuit Breaker': '6RDslq06ZS78Zph1',
  'Record GCal Success': 'bT0r2EmUqGjc6Ioz'
};

wf.nodes = wf.nodes.map((node: any) => {
  if (INTERNAL_IDS[node.name]) {
    const wfId = INTERNAL_IDS[node.name];
    console.log(`Converting ${node.name} to direct Execute Workflow (ID: ${wfId})`);
    
    return {
      parameters: {
        workflowId: wfId, // Formato plano para máxima compatibilidad
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

const cleaned = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: {
    executionOrder: "v1",
    callerPolicy: "workflowsFromSameOwner",
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
    saveExecutionProgress: true,
    saveManualExecutions: true
  }
};

fs.writeFileSync('WF2_direct.json', JSON.stringify(cleaned, null, 2));
console.log('WF2 prepared with direct Execute Workflow nodes.');
