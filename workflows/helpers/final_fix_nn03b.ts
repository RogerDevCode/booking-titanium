import * as fs from 'fs';
import * as path from 'path';

const p = path.join(process.cwd(), 'workflows', 'NN_03-B_Pipeline_Agent.json');
const data = JSON.parse(fs.readFileSync(p, 'utf-8'));

// Watchdog embebido
const WATCHDOG_TIMEOUT = 30000;
const watchdog = setTimeout(() => {
  console.error(`\n🚨 [Watchdog] El script excedió el tiempo límite de ${WATCHDOG_TIMEOUT}ms. Terminando proceso.`);
  process.exit(1);
}, WATCHDOG_TIMEOUT);

// 1. Eliminar nodo redundante "Is Valid?" que causaba bifurcación errónea (H02)
data.nodes = data.nodes.filter((n: any) => n.name !== "Is Valid?");

// 2. Reconectar Type Normalization -> Payload Validation directamente
data.connections["Type Normalization"] = {
  "main": [[{ "node": "Payload Validation", "type": "main", "index": 0 }]]
};

// 3. Conectar nodos de Error al Standard Contract Output final (H03)
const finalOutputNode = "📤 Standard Contract Output";
data.connections["Format Validation Error"] = { "main": [[{ "node": finalOutputNode, "type": "main", "index": 0 }]] };
data.connections["Format Security Error"] = { "main": [[{ "node": finalOutputNode, "type": "main", "index": 0 }]] };

// 4. Conectar Format Response al Standard Contract Output final (H06)
data.connections["Format Response"] = { "main": [[{ "node": finalOutputNode, "type": "main", "index": 0 }]] };

// 5. Corregir IDs de sub-workflows (RAG_02) (H11)
let rag02Id = "RAG_02_Document_Retrieval_ID";
try {
    const order = JSON.parse(fs.readFileSync('scripts-ts/workflow_activation_order.json', 'utf-8'));
    const rag = order.find((w: any) => w.name === "RAG_02_Document_Retrieval");
    if (rag) rag02Id = rag.id;
} catch(e) {}

for (const node of data.nodes) {
    if (node.name === "Execute: RAG_02") {
        node.parameters.workflowId.value = rag02Id;
    }
}

// 6. Unificar versión y origen en _meta (H17)
for (const node of data.nodes) {
    if (node.parameters && node.parameters.jsCode) {
        node.parameters.jsCode = node.parameters.jsCode
            .replace(/version:\s*['"][^'"]+['"]/g, "version: '2.0.0'")
            .replace(/source:\s*['"][^'"]+['"]/g, "source: 'NN_03-B_Pipeline_Agent'");
    }
}

fs.writeFileSync(p, JSON.stringify(data, null, 2));
console.log('✅ Fixes aplicados a NN_03-B.');
clearTimeout(watchdog);
