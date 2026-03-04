import * as fs from 'fs';
import * as path from 'path';

const agentFilePath = path.join(__dirname, '../workflows/NN_03_AI_Agent.json');

function rewriteAgent() {
  const data = JSON.parse(fs.readFileSync(agentFilePath, 'utf8'));

  // Mantener los nodos base hasta el 'Is Valid?'
  const keepNodes = data.nodes.filter((n: any) => 
    ['trigger_webhook', 'extract_validate', 'is_valid_if', 'format_error', 'manual_trigger', 'exec_wf_trigger'].includes(n.id)
  );

  // Crear Nodos del AI Agent Avanzado (LangChain)
  const advancedNodes = [
    {
      "parameters": {
        "promptType": "define",
        "text": "={{ $json.text }}\n\nINFORMACION ADICIONAL (DISPONIBILIDAD ACTUAL): {{ JSON.stringify($json.availability) }}",
        "options": {
          "systemMessage": "Eres el asistente inteligente de Booking Titanium. Tu propósito principal es ayudar a los usuarios a agendar, consultar, reagendar y cancelar turnos. Cuando necesites información, utiliza las herramientas MCP disponibles. Responde de forma clara y amigable."
        }
      },
      "id": "ai_agent_node",
      "name": "AI Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [ 850, 320 ]
    },
    {
      "parameters": {
        "model": "llama-3.3-70b-versatile",
        "options": {
          "temperature": 0.1
        }
      },
      "id": "groq_model",
      "name": "Groq Chat Model",
      "type": "@n8n/n8n-nodes-langchain.lmChatGroq",
      "typeVersion": 1,
      "position": [ 850, 520 ],
      "credentials": {
        "groqApi": {
          "id": "groq-cred-id",
          "name": "Groq API"
        }
      }
    },
    {
      "parameters": {
        "windowSize": 10
      },
      "id": "memory_buffer",
      "name": "Window Buffer Memory",
      "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      "typeVersion": 1.2,
      "position": [ 1000, 520 ]
    },
    {
      "parameters": {
        "jsCode": "const aiResp = $input.first()?.json?.output || \"Sin respuesta de IA\";\nconst pre = $node[\"Extract & Validate (PRE)\"].json;\n\nreturn [{\n  json: {\n    success: true,\n    error_code: null,\n    error_message: null,\n    data: {\n      intent: \"AI_RESPONSE\",\n      chat_id: pre.chat_id,\n      ai_response: aiResp\n    },\n    _meta: { source: \"NN_03_AI_Agent\", timestamp: new Date().toISOString() }\n  }\n}];"
      },
      "id": "format_success",
      "name": "Format Success (POST)",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2.2,
      "position": [ 1250, 320 ]
    }
  ];

  data.nodes = [...keepNodes, ...advancedNodes];

  // Reescribir conexiones
  data.connections = {
    "Manual Trigger": {
      "main": [
        [ { "node": "Extract & Validate (PRE)", "type": "main", "index": 0 } ]
      ]
    },
    "Execute Workflow Trigger": {
      "main": [
        [ { "node": "Extract & Validate (PRE)", "type": "main", "index": 0 } ]
      ]
    },
    "Webhook": {
      "main": [
        [ { "node": "Extract & Validate (PRE)", "type": "main", "index": 0 } ]
      ]
    },
    "Extract & Validate (PRE)": {
      "main": [
        [ { "node": "Is Valid?", "type": "main", "index": 0 } ]
      ]
    },
    "Is Valid?": {
      "main": [
        [ { "node": "AI Agent", "type": "main", "index": 0 } ],
        [ { "node": "Format Error", "type": "main", "index": 0 } ]
      ]
    },
    "AI Agent": {
      "main": [
        [ { "node": "Format Success (POST)", "type": "main", "index": 0 } ]
      ]
    },
    "Groq Chat Model": {
      "ai_languageModel": [
        [ { "node": "AI Agent", "type": "ai_languageModel", "index": 0 } ]
      ]
    },
    "Window Buffer Memory": {
      "ai_memory": [
        [ { "node": "AI Agent", "type": "ai_memory", "index": 0 } ]
      ]
    }
  };

  fs.writeFileSync(agentFilePath, JSON.stringify(data, null, 2));
  console.log('✅ NN_03_AI_Agent.json successfully rewritten for MCP and LangChain.');
}

rewriteAgent();
