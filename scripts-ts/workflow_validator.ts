import fs from 'fs';
import path from 'path';

const workflowPath = process.argv[2];

if (!workflowPath) {
    console.error('Uso: npx tsx workflow_validator.ts <workflow.json>');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const nodes = data.nodes || [];

console.log('\n🛡️ AUDITORÍA RED TEAM - ' + path.basename(workflowPath));
console.log('==================================================');

let score = 1.0;
let issues = 0;

// 1. Standard Contract
const lastNode = nodes.find(n => n.name === 'Final Response' || n.name === 'Standard Success Output');
if (lastNode && JSON.stringify(lastNode).includes('_meta')) {
    console.log('✅ Standard Contract: Detectado');
} else {
    console.log('❌ Standard Contract: NO detectado');
    score -= 0.2;
    issues++;
}

// 2. Triple Entry
const trigs = nodes.filter(n => n.type.includes('Trigger') || n.type === 'n8n-nodes-base.webhook');
if (trigs.length >= 3) {
    console.log('✅ Triple Entry Pattern: Cumple (' + trigs.length + ')');
} else {
    console.log('⚠️ Triple Entry Pattern: Solo ' + trigs.length + ' triggers (mínimo 3)');
    score -= 0.1;
    issues++;
}

// 3. Prohibición $env
const envViolations = nodes.filter(n => JSON.stringify(n).includes('$env'));
if (envViolations.length === 0) {
    console.log('✅ PROHIBIDO_04 ($env): Sin violaciones');
} else {
    console.log('❌ PROHIBIDO_04 ($env): ' + envViolations.length + ' violaciones detectadas');
    score -= 0.3;
    issues++;
}

// 4. Validation Sandwich
const pre = nodes.find(n => n.name.includes('Validate') || n.name.includes('PRE') || n.name.includes('Parse'));
if (pre) {
    console.log('✅ Validation Sandwich (PRE): Implementado');
} else {
    console.log('❌ Validation Sandwich (PRE): No encontrado');
    score -= 0.2;
    issues++;
}

console.log('--------------------------------------------------');
console.log('SCORE FINAL: ' + score.toFixed(2) + ' / 1.0');

if (score < 0.8) {
    console.log('\n❌ RESULTADO: FALLO DE AUDITORÍA');
    process.exit(1);
} else {
    console.log('\n✅ RESULTADO: PASSED');
}
