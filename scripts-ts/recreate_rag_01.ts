import * as fs from 'fs';

const p = 'workflows/RAG_01_Document_Ingestion.json';

const content = `{
  "name": "RAG_01_Document_Ingestion",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "rag-ingest-document",
        "responseMode": "lastNode",
        "options": {}
      },
      "id": "6b42fae6-562c-4d45-978b-416020431894",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [
        6448,
        688
      ],
      "webhookId": "rag-ingest-document"
    },
    {
      "parameters": {},
      "id": "c893d409-bc62-490b-bbca-7c614722b838",
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [
        6448,
        896
      ]
    },
    {
      "parameters": {
        "inputSource": "jsonExample",
        "jsonExample": "{ \\"provider_id\\": 1, \\"title\\": \\"Ejemplo de documento\\", \\"content\\": \\"Contenido de ejemplo para RAG\\", \\"source_type\\": \\"faq\\", \\"status\\": \\"published\\", \\"language\\": \\"es\\" }"
      },
      "id": "c33b0ed8-348f-4edc-af86-9a5c88b7f805",
      "name": "Execute Workflow Trigger",
      "type": "n8n-nodes-base.executeWorkflowTrigger",
      "typeVersion": 1.1,
      "position": [
        6448,
        1088
      ]
    },
    {
      "parameters": {
        "jsCode": "// Validation Sandwich - PRE Validate (SEC02)\\n// O03: Extract → Validate → Build | SEC04: Regex Whitelist\\n// Unicode: Spanish + English via rangos \\\\uXXXX explícitos (sin backticks en regex)\\n\\nconst input = $input.first()?.json.body || $input.first()?.json || {};\\n\\n// EXTRACT\\nconst provider_id  = input.provider_id  !== undefined ? Number(input.provider_id)  : null;\\nlet service_id     = null;\\nif (input.service_id !== undefined && input.service_id !== null && input.service_id !== '') {\\n    service_id = Number(input.service_id);\\n}\\n\\nconst title        = input.title        !== undefined ? String(input.title).trim()  : '';\\nconst content      = input.content      !== undefined ? String(input.content).trim(): '';\\nconst language     = input.language     !== undefined ? String(input.language).toLowerCase().trim() : 'es';\\nconst status       = input.status       !== undefined ? String(input.status).toLowerCase().trim()   : 'published';\\n\\n// SEC04 - Regex Whitelist\\n// CRÍTICO: NO usar escapes inválidos (\\\\;, \\\\,, etc.) con flag /u, genera SyntaxError.\\n// Agregados ¿ ¡ para español y símbolos comunes ($ / @ & % + = * #)\\nconst safeStringRegex = /^[\\\\w\\\\s\\\\-'\\\".,?!():;$\\\\/@&%+=*#\\\\n\\\\r\\\\u00C0-\\\\u017F¿¡]{1,500}$/u;\\nconst safeLongRegex   = /^[\\\\w\\\\s\\\\-'\\\".,?!():;$\\\\/@&%+=*#\\\\n\\\\r\\\\[\\\\]{}\\\\u00C0-\\\\u017F¿¡]{1,50000}$/u;\\nconst langRegex       = /^[a-z]{2}$/;\\n\\n// Valid ENUMs\\nconst validSourceTypes = ['faq','policy','schedule','service','provider','insurance','pricing','preparation','post_care','emergency','other'];\\nconst validStatuses    = ['published','draft','archived'];\\n\\nlet source_type = input.source_type !== undefined ? String(input.source_type).toLowerCase().trim() : 'other';\\nif (!validSourceTypes.includes(source_type)) source_type = 'other';\\n\\nif (!validStatuses.includes(status)) {\\n  throw new Error('VALIDATION_ERROR: status must be one of: ' + validStatuses.join(', '));\\n}\\n\\n// VALIDATE\\nconst errors = [];\\n\\nif (!provider_id || provider_id <= 0 || !Number.isInteger(provider_id)) {\\n  errors.push('provider_id must be positive integer');\\n}\\nif (service_id !== null && (!Number.isInteger(service_id) || service_id <= 0 || isNaN(service_id))) {\\n  errors.push('service_id must be positive integer or omitted');\\n}\\nif (!title || title.length < 5) {\\n  errors.push('title too short (min 5 chars)');\\n}\\nif (title && !safeStringRegex.test(title)) {\\n  errors.push('title contains invalid characters');\\n}\\nif (!content || content.length < 10) {\\n  errors.push('content too short (min 10 chars)');\\n}\\nif (content && !safeLongRegex.test(content)) {\\n  errors.push('content contains invalid characters');\\n}\\nif (!langRegex.test(language)) {\\n  errors.push('language must be 2-char ISO code (e.g. es, en)');\\n}\\n\\nif (errors.length > 0) {\\n  throw new Error('VALIDATION_ERROR: ' + errors.join(' | '));\\n}\\n\\nlet metadata = {};\\nif (input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)) {\\n  metadata = input.metadata;\\n}\\n\\nconst summary = input.summary\\n  ? String(input.summary).substring(0, 500)\\n  : (content.length > 200 ? content.substring(0, 197) + '...' : content);\\n\\nreturn [{\\n  json: {\\n    success: true,\\n    error_code: null,\\n    error_message: null,\\n    provider_id,\\n    service_id,\\n    title,\\n    content,\\n    source_type,\\n    status,\\n    language,\\n    metadata,\\n    summary,\\n    _meta: {\\n      source: 'RAG_01_Document_Ingestion',\\n      timestamp: new Date().toISOString(),\\n      version: '1.7.4'\\n    }\\n  }\\n}];"
      },
      "id": "498dda4b-6ff4-4c72-a6c2-48db3fd8120f",
      "name": "Validate & Normalize",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        6640,
        688
      ]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "leftValue": "={{ $json.success }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equal",
                "singleValue": true
              }
            }
          ]
        },
        "options": {}
      },
      "id": "3a0bd353-8d08-41af-bebe-08ab3473138b",
      "name": "Is Valid?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        6848,
        688
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/embeddings",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Content-Type",
              "value": "application/json"
            }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "model",
              "value": "text-embedding-3-small"
            },
            {
              "name": "input",
              "value": "={{ $('Validate & Normalize').first().json.content }}"
            },
            {
              "name": "dimensions",
              "value": "={{ 1536 }}"
            }
          ]
        },
        "options": {
          "timeout": 30000,
          "maxRetries": 3,
          "retryWait": {
            "type": "exponentialBackoff",
            "base": 1000
          }
        }
      },
      "id": "e0a6d45f-4a0f-48db-81dc-492ab1db116d",
      "name": "Get OpenAI Embedding",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [
        7056,
        688
      ],
      "credentials": {
        "httpHeaderAuth": {
          "id": "8HwznNQRrIZCMsyQ",
          "name": "OpenAI API Key Header"
        }
      },
      "retryOnFail": true,
      "maxTries": 3,
      "waitBetweenTries": 1000
    },
    {
      "parameters": {
        "jsCode": "// Post-Validate Embedding (SEC02)\\n// httpRequest /v1/embeddings retorna: { data: [{ embedding: [...1536] }] }\\n\\nconst response = $input.first()?.json;\\n\\nif (!response || !response.data || !Array.isArray(response.data) || response.data.length === 0) {\\n  throw new Error('EMBEDDING_ERROR: OpenAI returned empty or invalid response');\\n}\\n\\nconst embedding = response.data[0]?.embedding;\\n\\nif (!Array.isArray(embedding) || embedding.length !== 1536) {\\n  throw new Error('EMBEDDING_ERROR: Expected 1536 floats, got length ' + (embedding?.length ?? 'undefined'));\\n}\\n\\nif (!embedding.every(n => typeof n === 'number' && isFinite(n))) {\\n  throw new Error('EMBEDDING_ERROR: Embedding contains non-finite values');\\n}\\n\\n// Merge con validated data\\nconst validatedData = $('Validate & Normalize').first()?.json;\\n\\nreturn [{\\n  json: {\\n    ...validatedData,\\n    embedding\\n  }\\n}];"
      },
      "id": "ccf5d475-4c07-4589-9e8c-8c17ec4a57f6",
      "name": "Post-Validate Embedding",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        7248,
        688
      ]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "leftValue": "={{ $json.embedding.length }}",
              "rightValue": 1536,
              "operator": {
                "type": "number",
                "operation": "equal",
                "singleValue": true
              }
            }
          ]
        },
        "options": {}
      },
      "id": "2da18237-7f93-4a1e-8e43-bcf6b509ef2f",
      "name": "Embedding Success?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        7440,
        688
      ]
    },
    {
      "parameters": {
        "jsCode": "// O03 Postgres 4 Capas - BUILD\\n// P02 workaround: interpolación + casteo estricto (SEC03)\\n// SEC05: escape de backslash + comillas simples + límite longitud\\n\\nconst d = $input.first()?.json;\\n\\n// Guards redundantes (SEC02 defense-in-depth)\\nif (!Array.isArray(d.embedding) || d.embedding.length !== 1536) throw new Error('BUILD_ERROR: invalid embedding');\\nif (!Number.isInteger(d.provider_id) || d.provider_id <= 0) throw new Error('BUILD_ERROR: invalid provider_id');\\nif (!d.title || d.title.length < 5) throw new Error('BUILD_ERROR: invalid title');\\nif (!d.content || d.content.length < 10) throw new Error('BUILD_ERROR: invalid content');\\n\\n// SEC05 - Escape helper: backslash + single quotes + truncate\\nconst esc = (s, maxLen = 500) => String(s ?? '')\\n  .replace(/\\\\\\\\/g, '\\\\\\\\\\\\\\\\')\\n  .replace(/'/g, \\"''\\")\\n  .substring(0, maxLen);\\n\\nconst embeddingLiteral = \\`'[\\${d.embedding.join(',')}]'::vector(1536)\\`;\\nconst serviceIdLiteral = (d.service_id !== null && Number.isInteger(d.service_id))\\n  ? String(d.service_id)\\n  : 'NULL';\\n\\n// metadata: validar que sea object serializable\\nlet metaJson;\\ntry {\\n  metaJson = JSON.stringify(d.metadata || {});\\n  if (metaJson.length > 10000) throw new Error('metadata too large');\\n} catch(e) {\\n  throw new Error('BUILD_ERROR: metadata serialization failed');\\n}\\n\\nconst query = \\\`\\nINSERT INTO rag_documents (\\n  provider_id,\\n  service_id,\\n  title,\\n  content,\\n  summary,\\n  embedding,\\n  source_type,\\n  status,\\n  language,\\n  metadata\\n) VALUES (\\n  \\${d.provider_id}::bigint,\\n  \\${serviceIdLiteral}\\${serviceIdLiteral !== 'NULL' ? '::bigint' : ''},\\n  '\\${esc(d.title)}'::text,\\n  '\\${esc(d.content, 50000)}'::text,\\n  '\\${esc(d.summary)}'::text,\\n  \\${embeddingLiteral},\\n  '\\${esc(d.source_type)}'::rag_source_type,\\n  '\\${esc(d.status)}'::rag_document_status,\\n  '\\${esc(d.language, 10)}'::text,\\n  '\\${esc(metaJson, 10000)}'::jsonb\\n)\\nRETURNING id, provider_id, title, created_at;\\n\\\`.trim();\\n\\nreturn [{ json: { query } }];"
      },
      "id": "09d700ec-f889-4148-9bcc-882c0971ee92",
      "name": "Build Parameterized Query",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        7632,
        688
      ]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "={{ $json.query }}",
        "options": {}
      },
      "id": "31f471e9-4402-4ec4-bc4a-9db10640df22",
      "name": "Execute Insert",
      "type": "n8n-nodes-base.postgres",
      "typeVersion": 2.6,
      "position": [
        7824,
        688
      ],
      "retryOnFail": true,
      "maxTries": 3,
      "waitBetweenTries": 1000,
      "credentials": {
        "postgres": {
          "id": "SFNQsmuu4zirZAnP",
          "name": "Postgres account"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "// Post-Validate Database Insert (SEC02)\\n// N8N postgres node retorna array de objetos para sentencias RETURNING\\n\\nconst dbOutput = $input.all();\\n\\nif (!dbOutput || dbOutput.length === 0 || !dbOutput[0].json || !dbOutput[0].json.id) {\\n  throw new Error('DATABASE_ERROR: Insert failed or missing RETURNING clause output');\\n}\\n\\nreturn [{\\n  json: {\\n    db_result: dbOutput[0].json\\n  }\\n}];"
      },
      "id": "90e54d32-23c2-48cd-b80c-7164993a207d",
      "name": "Post-Validate Insert",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        8016,
        688
      ]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "typeValidation": "strict"
          },
          "conditions": [
            {
              "leftValue": "={{ $json.db_result.id != null }}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "equal",
                "singleValue": true
              }
            }
          ]
        },
        "options": {}
      },
      "id": "e2ba9e57-a37a-4467-b50a-9d2a02b1f8fb",
      "name": "Insert Success?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [
        8208,
        688
      ]
    },
    {
      "parameters": {
        "jsCode": "// Format Success Response - Standard Contract O02\\n// 📤 OUT\\n\\nconst dbRecord = $input.first()?.json.db_result || {};\\n\\nreturn [{\\n  json: {\\n    success: true,\\n    error_code: null,\\n    error_message: null,\\n    data: {\\n      document_id: dbRecord.id,\\n      title: dbRecord.title,\\n      provider_id: dbRecord.provider_id,\\n      created_at: dbRecord.created_at\\n    },\\n    _meta: {\\n      source: 'RAG_01_Document_Ingestion',\\n      timestamp: new Date().toISOString(),\\n      workflow_id: 'RAG_01',\\n      version: '1.7.4'\\n    }\\n  }\\n}];"
      },
      "id": "18c1e7a5-fb74-4b53-b09e-7c50a1df280d",
      "name": "Format Success Response",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        8416,
        656
      ]
    },
    {
      "parameters": {
        "jsCode": "// Central Error Handler - Standard Contract O02 (SEC02)\\n// 📤 OUT - Errors\\n// Recibe payload de Validation Error, Embedding Error, DB Error o throws catch-all\\n\\nconst input = $input.first()?.json || {};\\n\\n// Intentar extraer código del mensaje de error si viene de un throw directo (sin formatear)\\nlet errorCode    = input.error_code    || 'GENERAL_ERROR';\\nlet errorMessage = input.error_message || input.message || input.error?.message || 'Unknown error occurred';\\n\\n// Parsear prefijos como 'VALIDATION_ERROR: ...' generados en los throws\\nif (!input.error_code && errorMessage.includes(':')) {\\n  const parts = errorMessage.split(':', 2);\\n  const knownCodes = ['VALIDATION_ERROR','EMBEDDING_ERROR','DATABASE_ERROR','BUILD_ERROR'];\\n  if (knownCodes.includes(parts[0].trim())) {\\n    errorCode    = parts[0].trim();\\n    errorMessage = parts[1].trim();\\n  }\\n}\\n\\nreturn [{\\n  json: {\\n    success:       false,\\n    error_code:    errorCode,\\n    error_message: errorMessage,\\n    data:          null,\\n    _meta: {\\n      source:      'RAG_01_Document_Ingestion',\\n      timestamp:   new Date().toISOString(),\\n      workflow_id: 'RAG_01',\\n      version:     '1.7.4'\\n    }\\n  }\\n}];"
      },
      "id": "90400030-cf47-4f65-8bba-c1845110190a",
      "name": "Central Error Handler",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        8416,
        864
      ]
    },
    {
      "parameters": {
        "jsCode": "// Format Validation Error → Central Handler\\nconst msg = $input.first()?.json?.message || $input.first()?.json?.error?.message || 'Input validation failed';\\nreturn [{ json: { error_code: 'VALIDATION_ERROR', error_message: msg } }];"
      },
      "id": "67ce9fbf-b3c9-4b13-88bc-396ed6901844",
      "name": "Format Validation Error",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        7056,
        896
      ]
    },
    {
      "parameters": {
        "jsCode": "// Format Embedding Error → Central Handler\\nconst msg = $input.first()?.json?.message || $input.first()?.json?.error?.message || 'Failed to generate embedding from OpenAI';\\nreturn [{ json: { error_code: 'EMBEDDING_ERROR', error_message: msg } }];"
      },
      "id": "e0e37256-4c4f-4d37-af64-16a7f7223da9",
      "name": "Format Embedding Error",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        7632,
        896
      ]
    },
    {
      "parameters": {
        "jsCode": "// Format Database Error → Central Handler\\nconst msg = $input.first()?.json?.message || $input.first()?.json?.error?.message || 'Failed to insert document into database';\\nreturn [{ json: { error_code: 'DATABASE_ERROR', error_message: msg } }];"
      },
      "id": "05ff1ba4-5ff6-42fc-a2bb-090c238b725c",
      "name": "Format Database Error",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        8416,
        1056
      ]
    },
    {
      "parameters": {
        "jsCode": "// 📤 STANDARD CONTRACT OUTPUT (O02)\\n// Retorna esquema unificado para todos los workflows\\n\\nconst result = $input.first()?.json || {};\\n\\nreturn [{\\n  json: {\\n    success: result.success !== false,\\n    error_code: result.success === false ? (result.error_code || 'UNKNOWN_ERROR') : null,\\n    error_message: result.success === false ? (result.error_message || 'An error occurred') : null,\\n    data: result.data || null,\\n    _meta: {\\n      source: 'RAG_01_DOCUMENT_INGESTION',\\n      workflow_id: 'RAG_01_DOCUMENT_INGESTION',\\n      timestamp: new Date().toISOString(),\\n      version: '4.3.1'\\n    }\\n  }\\n}];"
      },
      "id": "40b17163-9f87-43cf-bc82-9a5cda365851",
      "name": "📤 Standard Contract Output",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        8704,
        752
      ]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Validate & Normalize",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Trigger": {
      "main": [
        [
          {
            "node": "Validate & Normalize",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Execute Workflow Trigger": {
      "main": [
        [
          {
            "node": "Validate & Normalize",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Validate & Normalize": {
      "main": [
        [
          {
            "node": "Is Valid?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Is Valid?": {
      "main": [
        [
          {
            "node": "Get OpenAI Embedding",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Format Validation Error",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get OpenAI Embedding": {
      "main": [
        [
          {
            "node": "Post-Validate Embedding",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Post-Validate Embedding": {
      "main": [
        [
          {
            "node": "Embedding Success?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Embedding Success?": {
      "main": [
        [
          {
            "node": "Build Parameterized Query",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Format Embedding Error",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Build Parameterized Query": {
      "main": [
        [
          {
            "node": "Execute Insert",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Execute Insert": {
      "main": [
        [
          {
            "node": "Post-Validate Insert",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Post-Validate Insert": {
      "main": [
        [
          {
            "node": "Insert Success?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Insert Success?": {
      "main": [
        [
          {
            "node": "Format Success Response",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Format Database Error",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Success Response": {
      "main": [
        [
          {
            "node": "📤 Standard Contract Output",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Central Error Handler": {
      "main": [
        [
          {
            "node": "📤 Standard Contract Output",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Validation Error": {
      "main": [
        [
          {
            "node": "Central Error Handler",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Embedding Error": {
      "main": [
        [
          {
            "node": "Central Error Handler",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Database Error": {
      "main": [
        [
          {
            "node": "Central Error Handler",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}`;

fs.writeFileSync(p, content);
console.log('Recreated RAG_01_Document_Ingestion.json from memory!');
