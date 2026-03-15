import * as fs from 'fs';
const p = 'workflows/NN_03-B_Pipeline_Agent.json';
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
for (const node of data.nodes) {
  if (node.type === 'n8n-nodes-base.executeWorkflowTrigger') {
    node.parameters = { "inputSource": "passthrough" };
  }
}
fs.writeFileSync(p, JSON.stringify(data, null, 2));
