import fs from 'fs';

const file = 'workflows/NN_03-B_Pipeline_Agent.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const connections = data.connections;

console.log("=== CONEXIONES DE TIPO AI (Modelos, Memoria, Herramientas) ===");
let modelsConnected = false;

for (const sourceNode in connections) {
    const connTypes = Object.keys(connections[sourceNode]);
    for (const type of connTypes) {
        if (type !== 'main') {
            for (const outputIndex in connections[sourceNode][type]) {
                const targets = connections[sourceNode][type][outputIndex];
                for (const target of targets) {
                    console.log(`[${type}] ${sourceNode} ---> ${target.node}`);
                    if (sourceNode.includes('Groq Model')) {
                        modelsConnected = true;
                    }
                }
            }
        }
    }
}

if (!modelsConnected) {
    console.log("\n⚠️ ALERTA: Los modelos de Groq NO están conectados al Agente/Extractor.");
}
