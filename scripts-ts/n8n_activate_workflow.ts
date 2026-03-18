#!/usr/bin/env tsx
/**
 * n8n_activate_workflow.ts - Activar/Desactivar workflows en n8n
 * =================================================================
 * 
 * Complemento para MCP: El MCP no puede activar workflows directamente,
 * este script usa la API REST para cambiar el estado 'active'.
 * 
 * CASOS DE USO:
 * 1. Después de crear/update vía MCP → activar workflow
 * 2. Desactivar workflow antes de update crítico
 * 3. Toggle rápido sin abrir la UI
 * 
 * USAGE:
 *   npx tsx n8n_activate_workflow.ts --help
 *   npx tsx n8n_activate_workflow.ts --id <workflow-id> --activate
 *   npx tsx n8n_activate_workflow.ts --id <workflow-id> --deactivate
 *   npx tsx n8n_activate_workflow.ts --name <workflow-name> --activate
 */

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "util";
import axios, { AxiosInstance } from "axios";
import * as dotenv from "dotenv";

// ─── Load .env ────────────────────────────────────────────────────────────────
const possibleEnvPaths = [
  path.join(process.cwd(), '.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  dotenv.config();
}

// ─── Terminal colors ──────────────────────────────────────────────────────────
const C = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  RED: "\x1b[91m",
  GREEN: "\x1b[92m",
  YELLOW: "\x1b[93m",
  CYAN: "\x1b[96m",
  GREY: "\x1b[90m",
};

const log = {
  ok:   (msg: string) => console.log(`${C.GREEN}✅ ${msg}${C.RESET}`),
  err:  (msg: string) => console.error(`${C.RED}❌ ${msg}${C.RESET}`),
  warn: (msg: string) => console.warn(`${C.YELLOW}⚠️  ${msg}${C.RESET}`),
  info: (msg: string) => console.log(`${C.CYAN}ℹ  ${msg}${C.RESET}`),
  dim:  (msg: string) => console.log(`${C.GREY}${msg}${C.RESET}`),
};

// ─── Config ───────────────────────────────────────────────────────────────────
function loadConfig(): { client: AxiosInstance; baseUrl: string } {
  const apiUrl = process.env.N8N_API_URL ||
                 process.env.N8N_HOST ||
                 'https://n8n.stax.ink';

  const apiKey = process.env.X_N8N_API_KEY ||
                 process.env.N8N_API_KEY ||
                 process.env.N8N_ACCESS_TOKEN;

  if (!apiUrl)
    throw new Error("N8N_API_URL/N8N_HOST no está definida en .env");

  if (!apiKey)
    throw new Error("N8N_API_KEY/X_N8N_API_KEY no está definida en .env");

  const baseUrl = apiUrl.replace(/\/$/, "") + "/api/v1";

  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": apiKey,
    },
    timeout: 30000,
    validateStatus: () => true,
  });

  return { client, baseUrl };
}

// ─── Helper: Fetch All Workflows ──────────────────────────────────────────────
async function fetchAllWorkflows(client: AxiosInstance): Promise<any[]> {
  const response = await client.get("/workflows");
  
  if (response.status === 401 || response.status === 403) {
    log.err(`Autenticación fallida (HTTP ${response.status})`);
    log.warn(`Verifica tu API key en .env`);
    throw new Error(`Authentication failed: HTTP ${response.status}`);
  }

  if (response.status >= 400) {
    log.err(`Error al obtener workflows: HTTP ${response.status}`);
    throw new Error(`Failed to fetch workflows: HTTP ${response.status}`);
  }

  return response.data.data || [];
}

// ─── Helper: Find Workflow by Name ────────────────────────────────────────────
function findWorkflowByName(workflows: any[], name: string): any {
  const matches = workflows.filter(wf => wf.name === name);
  
  if (matches.length === 0) {
    return null;
  }
  
  if (matches.length > 1) {
    log.warn(`Múltiples workflows con nombre '${name}':`);
    matches.forEach((wf, i) => {
      log.dim(`  ${i + 1}. ID: ${wf.id} (activo: ${wf.active})`);
    });
    log.warn(`Usando el más reciente: ${matches[matches.length - 1].id}`);
  }
  
  // Retornar el más reciente
  return matches.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
}

// ─── Main: Activate/Deactivate Workflow ───────────────────────────────────────
async function updateWorkflowActiveState(
  client: AxiosInstance,
  workflowId: string,
  active: boolean
): Promise<boolean> {
  try {
    // 1. Obtener workflow actual
    log.info(`Obteniendo workflow ${workflowId}...`);
    const getResponse = await client.get(`/workflows/${workflowId}`);
    
    if (getResponse.status >= 400) {
      log.err(`Workflow no encontrado: ${workflowId}`);
      return false;
    }
    
    const workflow = getResponse.data;
    const currentState = workflow.active;
    
    log.info(`Estado actual: ${currentState ? 'ACTIVO' : 'INACTIVO'}`);
    
    if (currentState === active) {
      log.warn(`El workflow ya está ${active ? 'ACTIVO' : 'INACTIVO'}`);
      return true;
    }
    
    // 2. Usar endpoint específico de activación/desactivación
    const endpoint = active ? 'activate' : 'deactivate';
    log.info(`Cambiando a ${active ? 'ACTIVO' : 'INACTIVO'} via POST /workflows/${workflowId}/${endpoint}...`);
    
    const response = await client.post(`/workflows/${workflowId}/${endpoint}`);
    
    if (response.status >= 400) {
      log.err(`Error al ${active ? 'activar' : 'desactivar'}: HTTP ${response.status}`);
      log.err(JSON.stringify(response.data, null, 2));
      return false;
    }
    
    const updatedWorkflow = response.data;
    
    // 3. Verificar resultado
    if (updatedWorkflow.active === active) {
      log.ok(`Workflow '${workflow.name}' (${workflowId}) ${active ? 'ACTIVADO' : 'DESACTIVADO'} exitosamente`);
      return true;
    } else {
      log.err(`El estado no se actualizó correctamente`);
      log.warn(`Estado resultante: ${updatedWorkflow.active ? 'ACTIVO' : 'INACTIVO'}`);
      return false;
    }
    
  } catch (error: any) {
    log.err(`Error: ${error.message}`);
    if (error.response) {
      log.err(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// ─── Help Message ─────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${C.BOLD}n8n_activate_workflow.ts - Activar/Desactivar workflows en n8n${C.RESET}
═══════════════════════════════════════════════════════════════════════════════

${C.BOLD}USAGE:${C.RESET}
  npx tsx n8n_activate_workflow.ts [OPTIONS]

${C.BOLD}REQUIRED (uno de los dos):${C.RESET}
  --id <id>, -i <id>              Workflow ID
  --name <name>, -n <name>        Workflow name (busca por nombre)

${C.BOLD}REQUIRED (uno de los dos):${C.RESET}
  --activate, -a                  Activar workflow
  --deactivate, -d                Desactivar workflow

${C.BOLD}OPTIONS:${C.RESET}
  --url <url>                     Override N8N_API_URL
  --api-key <key>                 Override N8N_API_KEY
  --help, -h                      Show this help message

${C.BOLD}EXAMPLES:${C.RESET}
  ${C.CYAN}# Activar por ID${C.RESET}
  npx tsx n8n_activate_workflow.ts --id ZgiDJcBT61v43NvN --activate

  ${C.CYAN}# Activar por nombre${C.RESET}
  npx tsx n8n_activate_workflow.ts --name WF2_Booking_Orchestrator --activate

  ${C.CYAN}# Desactivar por nombre${C.RESET}
  npx tsx n8n_activate_workflow.ts --name WF2_Booking_Orchestrator --deactivate

${C.BOLD}ENVIRONMENT VARIABLES:${C.RESET}
  N8N_API_URL / N8N_HOST          n8n instance URL
  N8N_API_KEY / X_N8N_API_KEY     API key

${C.BOLD}NOTAS:${C.RESET}
  - Este script es complemento al MCP (el MCP no puede activar directamente)
  - Para workflows con webhooks, puede ser necesario hacer "Publish" en la UI
  - El script hace un PUT completo del workflow con active: true/false

${C.BOLD}EXIT CODES:${C.RESET}
  0  Éxito
  1  Error
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs({
    args: process.argv.slice(2),
    options: {
      id: { type: 'string', short: 'i' },
      name: { type: 'string', short: 'n' },
      activate: { type: 'boolean', short: 'a' },
      deactivate: { type: 'boolean', short: 'd' },
      url: { type: 'string' },
      'api-key': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  });

  if (args.values.help) {
    showHelp();
    process.exit(0);
  }

  // Validar que se proporcione ID o nombre
  if (!args.values.id && !args.values.name) {
    log.err("Debes proporcionar --id o --name");
    showHelp();
    process.exit(1);
  }

  // Validar que se proporcione activate o deactivate
  if (!args.values.activate && !args.values.deactivate) {
    log.err("Debes proporcionar --activate o --deactivate");
    showHelp();
    process.exit(1);
  }

  if (args.values.activate && args.values.deactivate) {
    log.err("No puedes usar --activate y --deactivate al mismo tiempo");
    process.exit(1);
  }

  try {
    const { client } = loadConfig();
    const targetActive = args.values.activate === true;
    let workflowId = args.values.id as string;

    // Si se proporcionó nombre, buscar el workflow
    if (args.values.name) {
      log.info(`Buscando workflow '${args.values.name}'...`);
      const workflows = await fetchAllWorkflows(client);
      const workflow = findWorkflowByName(workflows, args.values.name as string);
      
      if (!workflow) {
        log.err(`Workflow '${args.values.name}' no encontrado`);
        process.exit(1);
      }
      
      workflowId = workflow.id;
      log.info(`Encontrado: ${workflow.name} (ID: ${workflowId})`);
    }

    // Ejecutar activación/desactivación
    const success = await updateWorkflowActiveState(client, workflowId, targetActive);
    
    process.exit(success ? 0 : 1);
    
  } catch (error: any) {
    log.err(`Error fatal: ${error.message}`);
    process.exit(1);
  }
}

// ─── Execute ──────────────────────────────────────────────────────────────────
main().catch((err: any) => {
  log.err(`Error no manejado: ${err.message}`);
  process.exit(1);
});
