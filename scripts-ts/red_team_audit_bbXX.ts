import * as fs from 'fs';
import * as path from 'path';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

const workflowsDir = path.join(__dirname, '../workflows');
const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'));

let totalScore = 0;
let validWorkflows = 0;

console.log('🛡️ RED TEAM AUDIT INICIADO');
console.log('==================================================');

for (const file of files) {
    const filePath = path.join(workflowsDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const nodes = data.nodes || [];

    let score = 1.0;
    const issues = [];

    // 1. Standard Contract
    const lastNodes = nodes.filter((n: any) => 
        n.name === 'Final Response' || 
        n.name.includes('Success Output') || 
        n.name.includes('Error Output') ||
        n.name === 'Format Error' ||
        n.name === 'Format Success (POST)'
    );
    
    let hasContract = false;
    for (const node of lastNodes) {
        if (JSON.stringify(node).includes('_meta')) {
            hasContract = true;
            break;
        }
    }
    
    if (!hasContract && nodes.length > 2 && !file.includes('Dummy') && !file.includes('Cron')) {
        issues.push('❌ Standard Contract NO detectado en nodos finales.');
        score -= 0.2;
    }

    // 2. Triple Entry (Root workflows only)
    if (file.startsWith('NN_0') && !file.includes('Error') && !file.includes('Cron') && !file.includes('Simple') && !file.includes('V4_Final')) {
        const trigs = nodes.filter((n: any) => n.type.includes('Trigger') || n.type === 'n8n-nodes-base.webhook');
        if (trigs.length < 3) {
            issues.push(`⚠️ Triple Entry Pattern: Solo ${trigs.length} triggers (se esperaban 3).`);
            score -= 0.1;
        }
    }

    // 3. Prohibición $env
    const envViolations = nodes.filter((n: any) => JSON.stringify(n).includes('$env.'));
    if (envViolations.length > 0) {
        issues.push(`❌ PROHIBIDO_04 ($env): ${envViolations.length} violaciones detectadas.`);
        score -= 0.3;
    }

    // 4. Validation Sandwich (PRE)
    const hasPre = nodes.some((n: any) => 
        n.name.includes('Validate') || 
        n.name.includes('PRE') || 
        n.name.includes('Parse') ||
        n.name.includes('Sanitize') ||
        n.name.includes('Build Secure')
    );
    
    if (!hasPre && nodes.length > 3 && !file.includes('Dummy') && !file.includes('Test')) {
        issues.push('❌ Validation Sandwich (PRE): No encontrado.');
        score -= 0.2;
    }

    // 5. Nodos IF tipo 1
    const badIfs = nodes.filter((n: any) => 
        n.type === 'n8n-nodes-base.if' && 
        n.typeVersion !== 1 &&
        JSON.stringify(n.parameters).includes('boolean')
    );
    
    if (badIfs.length > 0) {
        issues.push(`❌ IF Versioning: ${badIfs.length} nodos IF evaluando booleanos usando versión insegura (>1).`);
        score -= 0.2;
    }

    console.log(`\n📄 ${file} -> Score: ${Math.max(0, score).toFixed(2)} / 1.0`);
    issues.forEach(i => console.log(`   ${i}`));
    
    totalScore += Math.max(0, score);
    validWorkflows++;
}

const avgScore = totalScore / validWorkflows;
console.log('\n==================================================');
console.log(`📊 AVERAGE COMPLIANCE SCORE: ${avgScore.toFixed(2)} / 1.0`);

if (avgScore < 0.8) {
    console.error('\n💥 AUDITORÍA FALLIDA: El score promedio está por debajo de 0.8');
    watchdog.cancel();
    process.exit(1);
} else {
    console.log('\n✅ AUDITORÍA APROBADA: Cumplimiento de estándares de seguridad y arquitectura.');
    watchdog.cancel();
    process.exit(0);
}