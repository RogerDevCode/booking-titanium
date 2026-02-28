const fs = require('fs');
const path = require('path');

const dir = 'workflows';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

const SOT_NODE_VERSIONS = {
    "n8n-nodes-base.webhook": 2,
    "n8n-nodes-base.scheduleTrigger": 1.2,
    "n8n-nodes-base.manualTrigger": 1,
    "n8n-nodes-base.executeWorkflow": 1.3,
    "n8n-nodes-base.executeWorkflowTrigger": 1.1,
    "n8n-nodes-base.if": 2,
    "n8n-nodes-base.switch": 3,
    "n8n-nodes-base.code": 2,
    "n8n-nodes-base.set": 3.4,
    "n8n-nodes-base.postgres": 2.6,
    "n8n-nodes-base.httpRequest": 4.2,
    "n8n-nodes-base.telegram": 1.2,
    "n8n-nodes-base.googleCalendar": 1.3,
};

let issues = 0;

files.forEach(file => {
  const filePath = path.join(dir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`\nChecking ${file}...`);
  
  (data.nodes || []).forEach(node => {
    // Check typeVersion
    const reqVer = SOT_NODE_VERSIONS[node.type];
    if (reqVer !== undefined && node.typeVersion !== reqVer) {
      console.log(`  [WARNING] Node "${node.name}" (${node.type}) has v${node.typeVersion}, expected v${reqVer}`);
      issues++;
    }

    // Deep check for IF nodes v2
    if (node.type === 'n8n-nodes-base.if') {
      if (node.typeVersion === 2) {
        if (!node.parameters || !node.parameters.conditions || node.parameters.conditions.boolean) {
           console.log(`  [ERROR] Node "${node.name}" (IF v2) is using v1 parameter structure ("boolean" array).`);
           issues++;
        }
        if (node.parameters && node.parameters.conditions && node.parameters.conditions.conditions) {
            // Check if operator object exists
            node.parameters.conditions.conditions.forEach(cond => {
               if (!cond.operator || typeof cond.operator !== 'object') {
                   console.log(`  [ERROR] Node "${node.name}" (IF v2) condition missing operator object: ${JSON.stringify(cond)}`);
                   issues++;
               }
            });
        }
      }
    }
  });
});

if (issues === 0) {
  console.log('\nAll checked nodes are using the correct SOT versions and parameter structures! ✅');
} else {
  console.log(`\nFound ${issues} issue(s) that need fixing.`);
}
