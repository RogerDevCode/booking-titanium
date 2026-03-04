import * as fs from 'fs';

const v1 = fs.readFileSync('scripts-ts/workflow_validator.ts', 'utf-8');
const lines1 = v1.split('\n');
const start1 = lines1.findIndex(l => l.includes('requiredVersions') || l.includes('n8n-nodes-base.if'));
if (start1 !== -1) {
  console.log('--- workflow_validator.ts ---');
  console.log(lines1.slice(Math.max(0, start1 - 5), start1 + 20).join('\n'));
}

const v2 = fs.readFileSync('scripts-ts/validate_workflow.ts', 'utf-8');
const lines2 = v2.split('\n');
const start2 = lines2.findIndex(l => l.includes('requiredVersions') || l.includes('n8n-nodes-base.if'));
if (start2 !== -1) {
  console.log('--- validate_workflow.ts ---');
  console.log(lines2.slice(Math.max(0, start2 - 5), start2 + 20).join('\n'));
}

