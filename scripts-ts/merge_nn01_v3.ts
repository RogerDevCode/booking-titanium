import * as fs from 'fs';

const serverV3 = JSON.parse(fs.readFileSync('scripts-ts/nn01_server_v3.json', 'utf8'));
const localData = JSON.parse(fs.readFileSync('workflows/NN_01_Booking_Gateway.json', 'utf8'));
const activationOrder = JSON.parse(fs.readFileSync('scripts-ts/workflow_activation_order.json', 'utf8'));

// Mapa de nombres a IDs reales de activation_order
const ID_MAP: Record<string, string> = {};
activationOrder.forEach((wf: any) => {
    ID_MAP[wf.name] = wf.id;
});

// 1. Usar nombres consistentes (Standard)
const NN02_NAME = "Parse Incoming Payload (NN_02)";
const NN03_NAME = "Execute AI Agent (NN_03)";
const NN04_NAME = "Send Telegram Response (NN_04)";

// 2. Mantener estructura de validación de V3
let nodes = [...serverV3.nodes];

// 3. Extraer nodos de negocio de Local que NO están en V3 y corregir referencias
const businessNodeNames = ["Lookup Availability", "Prepare AI Input", "Intent Switch", "Flow: CREATE", "Flow: CANCEL"];
const businessNodes = localData.nodes.filter((n: any) => businessNodeNames.includes(n.name));

businessNodes.forEach((n: any) => {
    if (n.name === "Prepare AI Input") {
        // CORRECCIÓN CRÍTICA: Apuntar al nombre real del nodo NN_02 en V3
        n.parameters.assignments.assignments.forEach((a: any) => {
            if (a.value.includes('node["Execute NN_02"]')) {
                a.value = a.value.replace('node["Execute NN_02"]', `node["${NN02_NAME}"]`);
            }
        });
    }
});
nodes.push(...businessNodes);

// 4. Reemplazar el nodo de IA de V3 por uno que acepte la disponibilidad
const aiNode = nodes.find(n => n.name === NN03_NAME);
if (aiNode) {
    aiNode.parameters.inputData = `={
  "chat_id": {{ $node["${NN02_NAME}"].json.data.chat_id }},
  "text": "{{ $node["${NN02_NAME}"].json.data.text }}",
  "availability": {{ $node["Lookup Availability"].json }}
}`;
    aiNode.parameters.inputSource = "expression";
}

// 5. Configurar el nodo final de respuesta robusta
const finalResponseNode = {
    "parameters": {
        "jsCode": `// Final response - Resilient Standard Contract
try {
  const nn02 = $node["${NN02_NAME}"]?.json || {};
  const ai_res_node = $node["${NN03_NAME}"];
  const ai_data = (ai_res_node && ai_res_node.json) ? ai_res_node.json.data : {};
  const tg_res = $node["${NN04_NAME}"]?.json || {};

  const isSuccess = !!(nn02.success && ai_data.ai_response);

  return [{
    json: {
      success: isSuccess,
      error_code: isSuccess ? null : (nn02.error_code || "ORCHESTRATION_ERROR"),
      error_message: isSuccess ? null : (nn02.error_message || "Error en el flujo de orquestación"),
      data: isSuccess ? {
        message_sent: tg_res.success === true,
        chat_id: ai_data.chat_id,
        ai_response: ai_data.ai_response,
        intent: ai_data.intent
      } : null,
      _meta: {
        source: "NN_01_Booking_Gateway",
        timestamp: new Date().toISOString(),
        workflow_id: "NN_01",
        version: "3.3.0"
      }
    }
  }];
} catch (e) {
  return [{
    json: {
      success: false,
      error_code: "CRITICAL_SYSTEM_ERROR",
      error_message: e.message,
      data: null,
      _meta: { source: "NN_01_Booking_Gateway", timestamp: new Date().toISOString() }
    }
  }];
}`
    },
    "id": "final_robust_res",
    "name": "Final Response",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [1700, 432]
};

const v3ResponseIndex = nodes.findIndex(n => n.name === "Response");
if (v3ResponseIndex !== -1) {
    nodes[v3ResponseIndex] = finalResponseNode;
} else {
    nodes.push(finalResponseNode);
}

// 6. Sincronización de IDs reales y robustez (Continue on Fail)
nodes.forEach(node => {
    if (node.type === 'n8n-nodes-base.executeWorkflow') {
        // Habilitar continueOnFail para nodos críticos para que lleguen al Final Response
        if (node.name === NN02_NAME || node.name === NN03_NAME) {
            node.onError = "continueErrorOutput";
        }
        
        let targetName = "";
        const name = node.name;
        if (name.includes("NN_02")) targetName = "NN_02_Message_Parser";
        else if (name.includes("NN_03")) targetName = "NN_03_AI_Agent";
        else if (name.includes("NN_04")) targetName = "NN_04_Telegram_Sender";
        else if (name.includes("Availability")) targetName = "DB_Find_Next_Available";
        else if (name.includes("CREATE")) targetName = "DB_Create_Booking";
        else if (name.includes("CANCEL")) targetName = "DB_Cancel_Booking";

        const targetId = ID_MAP[targetName];
        if (targetId) {
            node.parameters.workflowId = {
                "__rl": true,
                "value": targetId,
                "mode": "id"
            };
        }
    }
});

// 7. Conexiones consistentes
const connections = {
    "When clicking ‘Test workflow’": { "main": [[{ "node": NN02_NAME, "type": "main", "index": 0 }]] },
    "Webhook": { "main": [[{ "node": NN02_NAME, "type": "main", "index": 0 }]] },
    "Execute Workflow Trigger": { "main": [[{ "node": NN02_NAME, "type": "main", "index": 0 }]] },
    [NN02_NAME]: { "main": [[{ "node": "Verify Parser (NN_02)", "type": "main", "index": 0 }]] },
    "Verify Parser (NN_02)": {
        "main": [
            [{ "node": "Lookup Availability", "type": "main", "index": 0 }],
            [{ "node": "Final Response", "type": "main", "index": 0 }]
        ]
    },
    "Lookup Availability": { "main": [[{ "node": "Prepare AI Input", "type": "main", "index": 0 }]] },
    "Prepare AI Input": { "main": [[{ "node": NN03_NAME, "type": "main", "index": 0 }]] },
    [NN03_NAME]: { "main": [[{ "node": "Verify AI (NN_03)", "type": "main", "index": 0 }]] },
    "Verify AI (NN_03)": {
        "main": [
            [{ "node": "Intent Switch", "type": "main", "index": 0 }],
            [{ "node": "Final Response", "type": "main", "index": 0 }]
        ]
    },
    "Intent Switch": {
        "main": [
            [{ "node": "Flow: CREATE", "type": "main", "index": 0 }],
            [{ "node": "Flow: CANCEL", "type": "main", "index": 0 }]
        ]
    },
    "Flow: CREATE": { "main": [[{ "node": NN04_NAME, "type": "main", "index": 0 }]] },
    "Flow: CANCEL": { "main": [[{ "node": NN04_NAME, "type": "main", "index": 0 }]] },
    [NN04_NAME]: { "main": [[{ "node": "Final Response", "type": "main", "index": 0 }]] }
};

const finalWorkflow = {
    name: "NN_01_Booking_Gateway_V3_Robust",
    nodes: nodes,
    connections: connections,
    settings: { executionOrder: "v1" },
    active: true
};

fs.writeFileSync('workflows/NN_01_Booking_Gateway.json', JSON.stringify(finalWorkflow, null, 2));
console.log('✅ Workflow NN_01 fusionado con nombres de nodos corregidos (V3.1)');
