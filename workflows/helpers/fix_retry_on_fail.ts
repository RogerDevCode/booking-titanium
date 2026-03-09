import * as fs from 'fs';
const p = 'workflows/NN_03-B_Pipeline_Agent.json';
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
for (const node of data.nodes) {
  if (node.retryOnFail !== undefined) {
    node.retryOnFail = true;
  }
  if (node._retryOnFail_obj !== undefined) {
    delete node._retryOnFail_obj;
  }
}
fs.writeFileSync(p, JSON.stringify(data, null, 2));
