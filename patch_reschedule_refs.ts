import * as fs from 'fs';

const id = 'F2F5oQ7okPDKwg9E'; // Reschedule
const raw = fs.readFileSync('WF_Reschedule_final.json', 'utf-8');
const wf = JSON.parse(raw);

// Actualizar el nodo "Step 2: Create New"
const createNode = wf.nodes.find(n => n.name === 'Step 2: Create New');
if (createNode) {
  createNode.parameters.workflowId.value = 'Z7g7DgxXQ61V368P';
}

fs.writeFileSync('WF_Reschedule_final_v2.json', JSON.stringify(wf, null, 2));
console.log('Referencia de sub-workflow en Reschedule actualizada a Z7g7DgxXQ61V368P.');
