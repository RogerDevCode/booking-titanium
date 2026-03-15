const fs = require('fs');

const wf = {
  "name": "WF2_Booking_Orchestrator_Error_Handler",
  "nodes": [
    {
      "parameters": {},
      "name": "Error Trigger",
      "type": "n8n-nodes-base.errorTrigger",
      "typeVersion": 1,
      "position": [0, 0]
    },
    {
      "parameters": {
        "jsCode": `
const err = $input.first().json;
return [{ json: {
  workflow_name: err.workflow?.name || 'unknown',
  execution_id: err.execution?.id || 'unknown',
  error_message: err.execution?.error?.message || 'Unknown catastrophic error',
  last_node: err.execution?.lastNodeExecuted || 'unknown',
  timestamp: new Date().toISOString()
}}];`
      },
      "name": "Extract Metadata",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [250, 0]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "INSERT INTO system_logs (workflow_name, execution_id, level, message, details) VALUES ($1, $2, 'CRITICAL', $3, $4);",
        "options": {
          "queryReplacement": "={{ $json.workflow_name }}, {{ $json.execution_id }}, {{ 'CATASTROPHIC: ' + $json.error_message }}, {{ JSON.stringify($json) }}"
        }
      },
      "name": "Log to DB",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [500, 0],
      "credentials": { "postgres": { "id": "SFNQsmuu4zirZAnP", "name": "Postgres account" } }
    }
  ],
  "connections": {
    "Error Trigger": { "main": [[{ "node": "Extract Metadata", "type": "main", "index": 0 }]] },
    "Extract Metadata": { "main": [[{ "node": "Log to DB", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
};

fs.writeFileSync('workflows/seed_clean/WF2_Booking_Orchestrator_Error_Handler.json', JSON.stringify(wf, null, 2));
