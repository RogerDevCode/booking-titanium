import * as fs from 'fs';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

const serverV3 = JSON.parse(fs.readFileSync('scripts-ts/nn01_server_v3.json', 'utf8'));
const localData = JSON.parse(fs.readFileSync('workflows/NN_01_Booking_Gateway.json', 'utf8'));
const activationOrder = JSON.parse(fs.readFileSync('scripts-ts/workflow_activation_order.json', 'utf8'));

const ID_MAP: Record<string, string> = {};
activationOrder.forEach((wf: any) => { ID_MAP[wf.name] = wf.id; });

const NN02_NAME = "Parse Incoming Payload (NN_02)";
const NN03_NAME = "Execute AI Agent (NN_03)";
const NN04_NAME = "Send Telegram Response (NN_04)";

let nodes = [...serverV3.nodes];

// 1. Prepare AI Input
const prepareNode = {
    "parameters": {
        "mode": "manual",
        "assignments": {
            "assignments": [
                { "id": "text", "name": "text", "value": `={{ $node["${NN02_NAME}"].json.data?.text }}`, "type": "string" },
                { "id": "chat_id", "name": "chat_id", "value": `={{ $node["${NN02_NAME}"].json.data?.chat_id }}`, "type": "number" },
                { "id": "avail_date", "name": "avail_date", "value": "={{ $node[\"Lookup Availability\"].json.date }}", "type": "string" },
                { "id": "slots", "name": "slots", "value": "={{ $node[\"Lookup Availability\"].json.slots }}", "type": "array" }
            ]
        }
    },
    "id": "prep_ai_input",
    "name": "Prepare AI Input",
    "type": "n8n-nodes-base.set",
    "typeVersion": 3.4,
    "position": [1000, 432]
};
const pIndex = nodes.findIndex(n => n.name === "Prepare AI Input");
if (pIndex !== -1) nodes[pIndex] = prepareNode; else nodes.push(prepareNode);

// 2. Telegram Node (HTTP)
const nn04HttpNode = {
    "parameters": {
        "method": "POST",
        "url": "https://n8n.stax.ink/webhook/nn-04-telegram-sender-test",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": `={ "chat_id": {{ $node["${NN02_NAME}"].json.data?.chat_id || 5391760292 }}, "ai_response": "{{ $node["${NN03_NAME}"].json.data?.ai_response || 'Error' }}" }`,
        "options": {}
    },
    "id": "nn04_http_call",
    "name": NN04_NAME,
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [1600, 432]
};
const n4Index = nodes.findIndex(n => n.name === NN04_NAME);
if (n4Index !== -1) nodes[n4Index] = nn04HttpNode; else nodes.push(nn04HttpNode);

// 3. Final Response
const finalResponseNode = {
    "parameters": {
        "jsCode": `const nn02 = $node["${NN02_NAME}"]?.json || {}; const ai = $node["${NN03_NAME}"]?.json?.data || {}; const tg = $node["${NN04_NAME}"]?.json || {}; return [{ json: { success: !!(nn02.success && ai.ai_response), data: { message_sent: !!(tg.success || tg.message_id), chat_id: ai.chat_id || nn02.data?.chat_id, ai_response: ai.ai_response, intent: ai.intent }, _meta: { source: "NN_01", timestamp: new Date().toISOString(), version: "4.1.0" } } }];`
    },
    "id": "final_res",
    "name": "Final Response",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [1850, 432]
};
const v3ResponseIndex = nodes.findIndex(n => n.name === "Response");
if (v3ResponseIndex !== -1) nodes[v3ResponseIndex] = finalResponseNode; else nodes.push(finalResponseNode);

// 4. Sync IDs
nodes.forEach(node => {
    if (node.type === 'n8n-nodes-base.executeWorkflow') {
        const name = node.name;
        let targetName = "";
        if (name.includes("NN_02")) targetName = "NN_02_Message_Parser";
        else if (name.includes("NN_03")) targetName = "NN_03_AI_Agent";
        else if (name.includes("Availability")) targetName = "DB_Find_Next_Available";
        const targetId = ID_MAP[targetName];
        if (targetId) node.parameters.workflowId = { "__rl": true, "value": targetId, "mode": "id" };
    }
});

// 5. Segurizar Conexiones
const connections = {
    "Webhook": { "main": [[{ "node": NN02_NAME, "type": "main", "index": 0 }]] },
    [NN02_NAME]: { "main": [[{ "node": "Verify Parser (NN_02)", "type": "main", "index": 0 }]] },
    "Verify Parser (NN_02)": { "main": [[{ "node": "Lookup Availability", "type": "main", "index": 0 }], [{ "node": "Final Response", "type": "main", "index": 0 }]] },
    "Lookup Availability": { "main": [[{ "node": "Prepare AI Input", "type": "main", "index": 0 }]] },
    "Prepare AI Input": { "main": [[{ "node": NN03_NAME, "type": "main", "index": 0 }]] },
    [NN03_NAME]: { "main": [[{ "node": "Verify AI (NN_03)", "type": "main", "index": 0 }]] },
    "Verify AI (NN_03)": { "main": [[{ "node": NN04_NAME, "type": "main", "index": 0 }], [{ "node": "Final Response", "type": "main", "index": 0 }]] },
    [NN04_NAME]: { "main": [[{ "node": "Final Response", "type": "main", "index": 0 }]] }
};

const finalWorkflow = { name: "NN_01_Booking_Gateway_V4_Final", nodes: nodes, connections: connections, settings: { executionOrder: "v1" }, active: true };
fs.writeFileSync('workflows/NN_01_Booking_Gateway.json', JSON.stringify(finalWorkflow, null, 2));
console.log('✅ NN_01 corregido V4.1');

// Cancel watchdog on success
watchdog.cancel();
