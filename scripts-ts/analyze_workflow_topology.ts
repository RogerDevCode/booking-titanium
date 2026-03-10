import fs from 'fs';

const file = 'workflows/NN_03-B_Pipeline_Agent.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const nodes = data.nodes;
const connections = data.connections;

const nodeNames = new Set(nodes.map((n: any) => n.name));
const triggers = new Set(nodes.filter((n: any) => n.name.includes('Trigger')).map((n: any) => n.name));

const incoming = new Map<string, string[]>();
const outgoing = new Map<string, string[]>();

for (const name of nodeNames) {
    incoming.set(name, []);
    outgoing.set(name, []);
}

for (const sourceNode in connections) {
    const mainConnection = connections[sourceNode].main || [];
    for (const outputIndex in mainConnection) {
        const targets = mainConnection[outputIndex];
        for (const target of targets) {
            outgoing.get(sourceNode)?.push(target.node);
            incoming.get(target.node)?.push(sourceNode);
        }
    }
}

console.log("=== NODOS DESCONECTADOS (Sin entradas y no son Triggers) ===");
for (const name of nodeNames) {
    if (!triggers.has(name) && incoming.get(name)?.length === 0) {
        console.log(`- ${name}`);
    }
}

console.log("\n=== SALIDAS MÚLTIPLES (Nodos finales que no conectan a nada) ===");
let finalNodes = 0;
for (const name of nodeNames) {
    if (outgoing.get(name)?.length === 0) {
        console.log(`- ${name}`);
        finalNodes++;
    }
}
if (finalNodes > 1) {
    console.log("⚠️ ALERTA: Hay múltiples salidas terminales en el workflow.");
}

console.log("\n=== BUCLES DE REALIMENTACIÓN (Ciclos) ===");
function findCycles() {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    function dfs(node: string, path: string[]) {
        visited.add(node);
        recursionStack.add(node);
        path.push(node);

        const neighbors = outgoing.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs(neighbor, [...path]);
            } else if (recursionStack.has(neighbor)) {
                const cycleStart = path.indexOf(neighbor);
                cycles.push(path.slice(cycleStart));
            }
        }
        recursionStack.delete(node);
    }

    for (const node of nodeNames) {
        if (!visited.has(node)) {
            dfs(node, []);
        }
    }
    return cycles;
}

const cycles = findCycles();
if (cycles.length === 0) {
    console.log("Ningún bucle encontrado.");
} else {
    cycles.forEach((cycle, i) => console.log(`Bucle ${i + 1}: ${cycle.join(' -> ')} -> ${cycle[0]}`));
}
