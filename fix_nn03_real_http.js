const fs = require('fs');
const filePath = 'workflows/NN_03_AI_Agent.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// 1. Remove all nodes except triggers and the first extractor
const keptNodes = data.nodes.filter(n => 
  n.type === 'n8n-nodes-base.manualTrigger' || 
  n.type === 'n8n-nodes-base.executeWorkflowTrigger' || 
  n.type === 'n8n-nodes-base.webhook' ||
  n.name === 'Extract & Validate (PRE)'
);

// 2. Add HTTP Request Node for Groq
const httpNode = {
  "parameters": {
    "method": "POST",
    "url": "https://api.groq.com/openai/v1/chat/completions",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"model\": \"llama-3.3-70b-versatile\",\n  \"messages\": [\n    {\"role\": \"system\", \"content\": \"Eres un asistente de reservas profesional para Booking Titanium. Responde de forma amable y concisa en español.\"},\n    {\"role\": \"user\", \"content\": \"{{ $json.text }}\"}\n  ]\n}",
    "options": {}
  },
  "id": "groq_http_node",
  "name": "Groq API (Real)",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [700, 420],
  "credentials": {
    "httpHeaderAuth": {
      "id": "mT5XZfEaeP1fqjl4",
      "name": "Groq Header API"
    }
  }
};

// 3. Add Success Formatter (Real Data)
const formatSuccess = {
  "parameters": {
    "jsCode": "const response = $input.first()?.json || {};\nconst ai_text = response.choices?.[0]?.message?.content || \"Error en respuesta de IA\";\nconst chat_id = $node[\"Extract & Validate (PRE)\"].json.chat_id;\n\nreturn [{\n  json: {\n    success: true,\n    error_code: null,\n    error_message: null,\n    data: {\n      ai_response: ai_text,\n      chat_id: chat_id\n    },\n    _meta: {\n      source: \"NN_03_AI_Agent\",\n      timestamp: new Date().toISOString(),\n      workflow_id: \"NN_03\",\n      version: \"1.1.0\"\n    }\n  }\n}];"
  },
  "id": "format_success_real",
  "name": "Format Success (POST)",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [950, 420]
};

// 4. Add Global Error Formatter
const formatError = {
  "parameters": {
    "jsCode": "return [{\n  json: {\n    success: false,\n    error_code: \"AI_API_ERROR\",\n    error_message: \"Error al contactar con el motor de IA\",\n    data: null,\n    _meta: {\n      source: \"NN_03_AI_Agent\",\n      timestamp: new Date().toISOString(),\n      workflow_id: \"NN_03\"\n    }\n  }\n}];"
  },
  "id": "format_error_real",
  "name": "Format Global Error",
  "type": "n8n-nodes-base.code",
  "typeVersion": 2,
  "position": [950, 600]
};

data.nodes = [...keptNodes, httpNode, formatSuccess, formatError];

// 5. Connect
data.connections = {
  "Manual Trigger": { "main": [[{ "node": "Extract & Validate (PRE)", "type": "main", "index": 0 }]] },
  "Execute Workflow Trigger": { "main": [[{ "node": "Extract & Validate (PRE)", "type": "main", "index": 0 }]] },
  "Webhook": { "main": [[{ "node": "Extract & Validate (PRE)", "type": "main", "index": 0 }]] },
  "Extract & Validate (PRE)": { "main": [[{ "node": "Groq API (Real)", "type": "main", "index": 0 }]] },
  "Groq API (Real)": { 
    "main": [
      [{ "node": "Format Success (POST)", "type": "main", "index": 0 }],
      [{ "node": "Format Global Error", "type": "main", "index": 0 }]
    ]
  }
};

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('NN_03 migrated to Real HTTP Groq API');
