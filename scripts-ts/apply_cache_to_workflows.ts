import fs from 'fs';
import path from 'path';

const WORKFLOWS_DIR = path.join(__dirname, '../workflows');

function applyCache(workflowName: string, dalNodeName: string) {
  const filePath = path.join(WORKFLOWS_DIR, `${workflowName}.json`);
  const wf = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const checkCacheNode = {
    "parameters": {
      "jsCode": "const staticData = $getWorkflowStaticData('global');\nconst provider = $json.provider_id || $json.body?.provider_id || 1;\nconst service = $json.service_id || $json.body?.service_id || 1;\nconst date = $json.date || $json.body?.date || '2026-03-04';\nconst key = `${provider}_${service}_${date}`;\nconst now = new Date().getTime();\n\nlet hit = false;\nlet data = null;\n\nif (staticData[key] && (now - staticData[key].timestamp < 5 * 60 * 1000)) {\n  hit = true;\n  data = staticData[key].data;\n}\n\nreturn {\n  json: { provider_id: provider, service_id: service, date: date, cache_hit: hit, cache_data: data, cache_key: key }\n};"
    },
    "name": "Check Cache",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [100, 400],
    "id": "check_cache"
  };

  const ifCacheNode = {
    "parameters": {
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "",
          "typeValidation": "strict"
        },
        "conditions": [
          {
            "id": "19bdfba9-dbb8-4e89-9a25-a1348fc5cb6d",
            "leftValue": "={{ $json.cache_hit === true }}",
            "rightValue": "",
            "operator": {
              "type": "boolean",
              "operation": "true",
              "singleValue": true
            }
          }
        ],
        "combinator": "and"
      },
      "options": {}
    },
    "name": "If Cache Hit",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.3,
    "position": [300, 400],
    "id": "if_cache"
  };

  const saveCacheNode = {
    "parameters": {
      "jsCode": "const staticData = $getWorkflowStaticData('global');\nconst dalResponse = $input.first()?.json || {};\nconst cacheKey = $('Check Cache').first().json.cache_key;\nif (dalResponse.success) {\n  staticData[cacheKey] = {\n    timestamp: new Date().getTime(),\n    data: dalResponse\n  };\n}\nreturn [{ json: dalResponse }];"
    },
    "name": "Save Cache",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [700, 500],
    "id": "save_cache"
  };

  // Adjust existing nodes
  let finalResponseNodeName = wf.nodes.find((n: any) => n.name.includes("Final") || n.name.includes("Format"))?.name;
  
  if (!finalResponseNodeName) finalResponseNodeName = "Final Response";

  wf.nodes = wf.nodes.map((n: any) => {
    if (n.name === dalNodeName) {
      n.position = [500, 500]; // move out of the way
    }
    if (n.name === finalResponseNodeName) {
      n.position = [900, 400];
      // Update its code to handle cache_hit correctly
      n.parameters.jsCode = "const input = $input.first()?.json || {};\nconst isCacheHit = input.cache_hit === true;\nconst dalResponse = isCacheHit ? input.cache_data : input;\nconst isSuccess = dalResponse.success === true || dalResponse.success === undefined;\n\nreturn [{\n  json: {\n    success: dalResponse.success !== undefined ? dalResponse.success : true,\n    error_code: isSuccess ? null : (dalResponse.error_code || 'DAL_ERROR'),\n    error_message: isSuccess ? null : (dalResponse.error_message || 'Operation failed'),\n    data: dalResponse.data || dalResponse,\n    _meta: {\n      source: '" + workflowName + "',\n      timestamp: new Date().toISOString(),\n      workflow_id: '" + workflowName + "',\n      version: '1.2.0'\n    }\n  }\n}];";
    }
    return n;
  });

  wf.nodes.push(checkCacheNode);
  wf.nodes.push(ifCacheNode);
  wf.nodes.push(saveCacheNode);

  // Re-wire connections
  // 1. Webhook, Manual, Execute -> Check Cache
  const triggers = ["Webhook", "Manual Trigger", "Execute Workflow Trigger"];
  triggers.forEach(t => {
    if (wf.connections[t]) {
      wf.connections[t] = {
        "main": [
          [
            {
              "node": "Check Cache",
              "type": "main",
              "index": 0
            }
          ]
        ]
      };
    } else {
        // If trigger exists in nodes but not in connections, add it
        if(wf.nodes.find((n: any) => n.name === t)) {
            wf.connections[t] = { "main": [ [ { "node": "Check Cache", "type": "main", "index": 0 } ] ] };
        }
    }
  });

  // 2. Check Cache -> If Cache Hit
  wf.connections["Check Cache"] = {
    "main": [
      [
        {
          "node": "If Cache Hit",
          "type": "main",
          "index": 0
        }
      ]
    ]
  };

  // 3. If Cache Hit -> True: Final Response, False: Call DAL Proxy
  wf.connections["If Cache Hit"] = {
    "main": [
      [ // True
        {
          "node": finalResponseNodeName,
          "type": "main",
          "index": 0
        }
      ],
      [ // False
        {
          "node": dalNodeName,
          "type": "main",
          "index": 0
        }
      ]
    ]
  };

  // 4. Call DAL Proxy -> Save Cache
  wf.connections[dalNodeName] = {
    "main": [
      [
        {
          "node": "Save Cache",
          "type": "main",
          "index": 0
        }
      ]
    ]
  };

  // 5. Save Cache -> Final Response
  wf.connections["Save Cache"] = {
    "main": [
      [
        {
          "node": finalResponseNodeName,
          "type": "main",
          "index": 0
        }
      ]
    ]
  };

  fs.writeFileSync(filePath, JSON.stringify(wf, null, 2));
  console.log(`Updated ${workflowName}.json with Caching logic.`);
}

applyCache("DB_Get_Availability", "Call DAL Proxy");
applyCache("DB_Find_Next_Available", "Call DAL Smart Lookup");
