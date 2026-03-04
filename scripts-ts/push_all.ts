import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Watchdog, WATCHDOG_TIMEOUT } from './watchdog';

// Start watchdog timer
const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
watchdog.start();

// Load .env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_URL = process.env.N8N_API_URL || 'https://n8n.stax.ink';
const API_KEY = process.env.N8N_API_KEY || process.env.N8N_ACCESS_TOKEN;

// Fields to strip from nodes
const STRIP_FIELDS = [
  "id", "createdAt", "updatedAt", "versionId", "staticData", "pinData", "meta", "active", "tags", "triggerCount"
];

// Allowed settings fields
const ALLOWED_SETTINGS = ["executionOrder", "saveManualExecutions", "callerPolicy", "errorWorkflow"];

async function sanitizeWorkflow(data: any, workflowName: string): Promise<any> {
  const cleaned: any = {
    name: workflowName,
    nodes: (data.nodes || []).map((node: any) => {
      const sanitized = { ...node };
      for (const field of STRIP_FIELDS) {
        delete sanitized[field];
      }
      return sanitized;
    }),
    connections: data.connections || {},
    settings: {}, // Always include settings (even if empty)
  };
  
  // Only include allowed settings if they exist
  if (data.settings) {
    for (const [key, value] of Object.entries(data.settings)) {
      if (ALLOWED_SETTINGS.includes(key)) {
        cleaned.settings[key] = value;
      }
    }
  }
  
  return cleaned;
}

async function pushAll() {
    if (!API_KEY) throw new Error('No API key in .env');

    const client = axios.create({
        baseURL: API_URL.replace(/\/$/, ''),
        headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
    });

    const orderPath = path.join(__dirname, 'workflow_activation_order.json');
    const order = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));

    for (const item of order) {
        const wfName = item.name;
        // Search json file safely (some might not have the BB/NN prefix exactly matched)
        const wfFiles = fs.readdirSync(path.join(__dirname, '../workflows'));
        const file = wfFiles.find(f => f.includes(wfName));

        if (!file) {
            console.log(`Skipping ${wfName} - json not found locally.`);
            continue;
        }

        const filePath = path.join(__dirname, '../workflows', file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        // Sanitize workflow data
        const sanitized = await sanitizeWorkflow(data, wfName);

        try {
            await client.put(`/api/v1/workflows/${item.id}`, sanitized);
            await client.post(`/api/v1/workflows/${item.id}/activate`);
            console.log(`[OK] Pushed & Activated: ${wfName}`);
        } catch(e: any) {
            console.error(`[ERR] Failed on ${wfName}:`, e.response?.data?.message || e.message);
        }
    }
    // Cancel watchdog on success
    watchdog.cancel();
}

pushAll();
