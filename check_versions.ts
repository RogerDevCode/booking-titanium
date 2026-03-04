import * as fs from 'fs';
import * as path from 'fs';
import { globSync } from 'glob';

const requiredVersions: Record<string, number> = {
  "n8n-nodes-base.if": 2.3,
  "n8n-nodes-base.switch": 3.4,
  "n8n-nodes-base.code": 2,
  "n8n-nodes-base.telegram": 1.2,
  "n8n-nodes-base.googleCalendar": 1.3,
  "n8n-nodes-base.executeWorkflow": 1.3,
  "n8n-nodes-base.executeWorkflowTrigger": 1.1,
  "n8n-nodes-base.webhook": 2.1,
  "n8n-nodes-base.manualTrigger": 1,
  "n8n-nodes-base.scheduleTrigger": 1.3,
  "n8n-nodes-base.httpRequest": 4.4,
  "n8n-nodes-base.set": 3.4,
  "n8n-nodes-base.postgres": 2.6
};

const files = fs.readdirSync('workflows').filter(f => f.endsWith('.json'));

let foundViolations = false;

for (const file of files) {
  const filePath = `workflows/${file}`;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!data.nodes) continue;
    for (const node of data.nodes) {
      if (requiredVersions[node.type]) {
        if (node.typeVersion < requiredVersions[node.type]) {
          console.log(`[VIOLATION] File: ${file} | Node: "${node.name}" | Type: ${node.type} | Current: ${node.typeVersion} | Required: >= ${requiredVersions[node.type]}`);
          foundViolations = true;
        }
      } else {
        // Just checking if we missed any known n8n-nodes-base
        if (node.type.startsWith('n8n-nodes-base.')) {
            // console.log(`[WARNING] File: ${file} | Unmonitored Type: ${node.type} (Version: ${node.typeVersion})`);
        }
      }
    }
  } catch (e) {
    console.error(`Error reading ${file}`);
  }
}

if (!foundViolations) {
  console.log("No version violations found in workflows/*.json");
}

