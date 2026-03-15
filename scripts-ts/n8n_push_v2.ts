#!/usr/bin/env tsx
/**
 * n8n_push_v2.ts - Enhanced N8N Workflow Uploader with Bidirectional Verification
 * ================================================================================
 *
 * 100% Native TypeScript - NO external dependencies (.py scripts)
 *
 * FIXES v2.1:
 * - [FIX] Eliminada detección JWT falsa positiva — siempre usa X-N8N-API-KEY
 *   Las API keys generadas en Settings → API tienen formato JWT (aud: public-api)
 *   pero n8n las autentica SOLO via X-N8N-API-KEY, nunca via Authorization: Bearer
 * - [FIX] Eliminado isJwtToken de loadConfig return y todos sus usos
 * - [FIX] Eliminados log.warn de JWT que confundían al usuario
 *
 * FEATURES (v2):
 * - Accept --name instead of --id (recommended)
 * - Auto-resolve ID from server by name
 * - Detect duplicate workflow names
 * - Auto-update workflow_activation_order.json
 * - Prevent accidental overwrites
 * - Bidirectional ID ↔ Name verification
 * - Native TypeScript workflow validation (replaces workflow_validator.py)
 * - Built-in --help documentation
 *
 * RETAINED FEATURES (from v1):
 * - Pre-upload validation
 * - Node version validation (SOT)
 * - Extended validation (10+ patterns, native TS)
 * - Retry logic with exponential backoff
 * - Post-upload verification
 * - Activate workflow
 * - Watchdog timer
 * - Force deactivate
 *
 * USAGE:
 *   npx tsx n8n_push_v2.ts --help
 *   npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway --file workflows/BB_01.json [--activate]
 *   npx tsx n8n_push_v2.ts --id 6m2U4vEf6mkACQ6B --file workflows/BB_01.json [--activate]
 *
 * OPTIONS:
 *   --name, -n        Workflow name (recommended, auto-resolves ID)
 *   --id, -i          Workflow ID (if you know it)
 *   --file, -f        Path to workflow JSON file
 *   --activate, -a    Activate workflow after upload
 *   --no-verify       Skip pre-upload validation
 *   --watchdog, -w    Watchdog timeout in seconds (default: 90)
 *   --force-deactivate  Force deactivate workflow before upload
 *   --no-sync-ids     Skip workflow_activation_order.json update
 *   --url             Override N8N_API_URL
 *   --api-key         Override N8N_API_KEY
 *   --help, -h        Show help message
 */

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "util";
import axios, { AxiosInstance, AxiosResponse } from "axios";
import * as dotenv from "dotenv";
import { Watchdog, WATCHDOG_TIMEOUT } from "./watchdog";
import { N8NConfig } from './config';

// Load .env from project root (SSOT - Single Source of Truth)
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
  WHITE: "\x1b[97m",
};

const log = {
  ok:   (msg: string) => console.log(`${C.GREEN}✅ ${msg}${C.RESET}`),
  err:  (msg: string) => console.error(`${C.RED}❌ ${msg}${C.RESET}`),
  warn: (msg: string) => console.warn(`${C.YELLOW}⚠️  ${msg}${C.RESET}`),
  info: (msg: string) => console.log(`${C.CYAN}ℹ  ${msg}${C.RESET}`),
  dim:  (msg: string) => console.log(`${C.GREY}${msg}${C.RESET}`),
};

// ─── Config ───────────────────────────────────────────────────────────────────
// FIX v2.1: Eliminada detección JWT y lógica condicional de headers.
// Las API keys de n8n (aud: "public-api") SIEMPRE se autentican via X-N8N-API-KEY.
// Authorization: Bearer es solo para sesiones de UI, no para la API REST pública.
// Ref: docs.n8n.io/api/authentication/
function loadConfig(options: { url?: string; apiKey?: string }) {
  const apiUrl = options.url ||
                 process.env.N8N_API_URL ||
                 process.env.N8N_HOST ||
                 'https://n8n.stax.ink';

  const apiKey = options.apiKey ||
                 process.env.X_N8N_API_KEY ||
                 process.env.N8N_API_KEY ||
                 process.env.N8N_ACCESS_TOKEN;

  if (!apiUrl)
    throw new Error(
      "N8N API URL is not set. Use --url or set N8N_API_URL/N8N_HOST in .env",
    );

  if (!apiKey)
    throw new Error(
      "N8N API Key is not set. Use one of:\n" +
      "  - --api-key <key> option\n" +
      "  - X_N8N_API_KEY environment variable (recommended)\n" +
      "  - N8N_API_KEY environment variable\n" +
      "  - N8N_ACCESS_TOKEN environment variable"
    );

  const baseUrl = apiUrl.replace(/\/$/, "") + "/api/v1";

  // FIX v2.1: Siempre X-N8N-API-KEY — sin detección JWT
  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": apiKey,
    },
    timeout: 50000,
    validateStatus: () => true,
  });

  return { client, baseUrl };
}

// ─── Workflow Validator (Native TypeScript) ───────────────────────────────────
interface ValidationIssue {
  workflow: string;
  node: string;
  severity: "ERROR" | "WARNING" | "INFO";
  patternId: string;
  description: string;
  line?: number;
  context?: string;
  fixAvailable: boolean;
}

const VALIDATION_RULES = [
  {
    id: "spread_broken",
    pattern: /(?<!\.)(\.\.|\.{4,})\s*([a-zA-Z_{])/g,
    description: "Spread operator corrupto (puntos != 3 o espacios extra)",
    severity: "ERROR" as const,
    scope: "jsCode",
  },
  {
    id: "unicode_broken",
    pattern: /(?<![a-zA-Z0-9_])\.([0-9a-fA-F]{4})(?![0-9a-fA-F])/g,
    description: "Caracter Unicode/Emoji degradado a texto plano",
    severity: "ERROR" as const,
    scope: "jsCode",
    filter: (match: string) =>
      !match.toLowerCase().startsWith("d") &&
      !/^\.\d{4}$/.test(match),
  },
  {
    id: "sql_returning_dot",
    pattern: /RETURNING\s+([^.'"`\n]+?)\s*\.\s*(?=[\s;'"`]|$)/g,
    description: "Cláusula RETURNING con punto residual",
    severity: "ERROR" as const,
    scope: "query",
  },
  {
    id: "bracket_newline_broken",
    pattern: /\{\\./g,
    description: "Apertura de bloque corrupto",
    severity: "ERROR" as const,
    scope: "jsCode",
    // Excluir: charsets de regex como [\{\\}] y escapes Unicode {\u00C0}
    filter: (match: string, _: string, offset: number, str: string) => {
      const after = str.substring(offset + match.length, offset + match.length + 10);
      const before = str.substring(Math.max(0, offset - 5), offset);
      // Si lo que sigue es } → es un charset de regex escape: \{...}
      if (after.startsWith("}")) return false;
      // Si lo que sigue es u + hex → es un escape unicode: \{\\u00C0}
      if (/^u[0-9a-fA-F]/.test(after)) return false;
      // Si va precedido de \\ → es parte de un escape sequence en charset
      if (before.endsWith("\\")) return false;
      return true;
    },
  },
  {
    id: "semicolon_newline_broken",
    pattern: /;\\\./g,
    description: "Fin de línea corrupto (;\\. debe ser ;\\n)",
    severity: "ERROR" as const,
    scope: "jsCode",
  },
  {
    id: "query_params_v3",
    pattern: /queryParameters/g,
    description: "Uso de queryParameters prohibido (bug N8N #11835)",
    severity: "ERROR" as const,
    scope: "node_params",
  },
];

const EXTENDED_PATTERNS = [
  {
    id: "close_bracket_broken",
    pattern: /\}\.(?!\d)/g,
    description: "Cierre de bloque corrupto: }. debe ser }\\n",
    severity: "ERROR" as const,
  },
  {
    id: "orphan_statement",
    pattern: /^\s*(isValid|isValidUUID|isValidISODate)\s*;\s*$/gm,
    description: "Línea huérfana sin contexto",
    severity: "ERROR" as const,
  },
  {
    id: "regex_unescaped_dot",
    pattern: /\(\\.\\d\{/g,
    description: "Regex con punto sin escapar",
    severity: "ERROR" as const,
  },
  {
    id: "comma_newline_broken",
    pattern: /,\.(?!\d)/g,
    description: "Coma corrupta: ,. debe ser ,\\n",
    severity: "ERROR" as const,
  },
  {
    id: "jsdoc_broken",
    pattern: /\/\*\*\\.\s*\*/g,
    description: "JSDoc corrupto",
    severity: "WARNING" as const,
  },
  {
    id: "double_period",
    pattern: /(?<![0-9])\.\.(?![0-9/])/g,
    description: "Doble punto sospechoso",
    severity: "WARNING" as const,
  },
  {
    id: "sql_where_dot",
    pattern: /WHERE\s+[^;]+\.(\s|$|;)/g,
    description: "SQL WHERE con posible punto residual",
    severity: "WARNING" as const,
  },
];

function validateWorkflowCode(
  code: string,
  workflowName: string,
  nodeName: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of [...VALIDATION_RULES, ...EXTENDED_PATTERNS]) {
    try {
      const matches = code.matchAll(rule.pattern);
      for (const match of matches) {
        if ("filter" in rule && typeof rule.filter === "function") {
          if (!rule.filter(match[0])) continue;
        }
        issues.push({
          workflow: workflowName,
          node: nodeName,
          severity: rule.severity,
          patternId: rule.id,
          description: rule.description,
          line: undefined,
          context: match[0],
          fixAvailable: "fix" in rule,
        });
      }
    } catch (e) {
      // Invalid regex, skip
    }
  }

  return issues;
}

function validateWorkflow(workflow: any): {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const workflowName = workflow.name || "Unknown";

  for (const node of workflow.nodes || []) {
    const jsCode = node.parameters?.jsCode;
    if (jsCode && typeof jsCode === "string") {
      const issues = validateWorkflowCode(
        jsCode,
        workflowName,
        node.name || node.id,
      );
      for (const issue of issues) {
        if (issue.severity === "ERROR") {
          errors.push(issue);
        } else {
          warnings.push(issue);
        }
      }
    }
  }

  return { errors, warnings };
}

// ─── Retry Wrapper ────────────────────────────────────────────────────────────
async function retryableRequest(
  requestFn: () => Promise<AxiosResponse>,
): Promise<AxiosResponse> {
  const maxRetries = 3;
  let delay = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await requestFn();
      if (response.status >= 500) {
        if (attempt === maxRetries) return response;
        log.warn(
          `Server error ${response.status}. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 20000);
        continue;
      }
      return response;
    } catch (error: any) {
      const isNetworkError = !error.response;
      if (isNetworkError && attempt < maxRetries) {
        log.warn(
          `Network error. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`,
        );
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 20000);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Unreachable");
}

// ─── Validation Functions ─────────────────────────────────────────────────────
const REQUIRED_KEYS = ["nodes", "connections"];
const EXECUTE_WF_TYPE = "n8n-nodes-base.executeWorkflow";

/**
 * Source of Truth for Node Versions - n8n v2.10.2+ Compatibility
 * AUTO-GENERATED from: scripts-ts/down-val-and-set-nodes/ssot-nodes.json
 * Generated at: 2026-03-02T16:24:17.486Z (n8n Version: 2.10.2)
 * CRITICAL: Using older versions causes "propertyValues[itemName] is not iterable"
 * Reference: GitHub issue #14775, PR #17580
 */
const SOT_NODE_VERSIONS: Record<string, number> = {
  "n8n-nodes-base.if":                      2.3,
  "n8n-nodes-base.switch":                  3.4,
  "n8n-nodes-base.code":                    2,
  "n8n-nodes-base.telegram":                1.2,
  "n8n-nodes-base.googleCalendar":          1.3,
  "n8n-nodes-base.executeWorkflow":         1.3,
  "n8n-nodes-base.executeWorkflowTrigger":  1.1,
  "n8n-nodes-base.webhook":                 2.1,
  "n8n-nodes-base.manualTrigger":           1,
  "n8n-nodes-base.scheduleTrigger":         1.3,
  "n8n-nodes-base.httpRequest":             4.4,
  "n8n-nodes-base.set":                     3.4,
  "n8n-nodes-base.postgres":                2.6,
};

function validateLocal(data: any): string[] {
  const warnings: string[] = [];
  const missing = REQUIRED_KEYS.filter((k) => !(k in data));
  if (missing.length > 0) {
    throw new Error(
      `Invalid workflow JSON — missing keys: ${missing.join(", ")}`,
    );
  }
  const nodes = data.nodes || [];
  if (nodes.length === 0) {
    warnings.push("Workflow has 0 nodes — probably wrong file");
  }
  for (const node of nodes) {
    if (node.type !== EXECUTE_WF_TYPE) continue;
    const name = node.name || "?";
    const ver = Number(node.typeVersion || 0);
    const params = node.parameters || {};
    if (ver < 1.3) {
      warnings.push(
        `Node '${name}': typeVersion=${ver} < 1.3 — n8n auto-migrates to 1.3 and may DROP workflowId+inputData (BUG-01)`,
      );
    }
    if (!("options" in params)) {
      warnings.push(
        `Node '${name}': missing 'options:{}' in parameters — CRITICAL: workflowId/inputData stripped on upload (BUG-01)`,
      );
    }
    const wfRef = params.workflowId || {};
    const wfVal = typeof wfRef === "object" ? wfRef.value : wfRef;
    if (!wfVal) {
      warnings.push(
        `Node '${name}': workflowId.value is empty — will call no sub-wf`,
      );
    }
  }
  return warnings;
}

function validateNodeVersions(data: any, stage: string): string[] {
  const errors: string[] = [];
  const nodes = data.nodes || [];
  for (const node of nodes) {
    const ntype = node.type;
    const nver = node.typeVersion;
    const nname = node.name || "?";
    const reqVer = SOT_NODE_VERSIONS[ntype];
    if (reqVer !== undefined) {
      if (Number(nver) !== Number(reqVer)) {
        errors.push(
          `[${stage}] Node '${nname}' (${ntype}) has v${nver}, SOT requires v${reqVer}`,
        );
      }
    }
  }
  return errors;
}

const STRIP_FIELDS = [
  "id", "createdAt", "updatedAt", "versionId", "staticData",
  "pinData", "meta", "active", "tags", "triggerCount",
];

function sanitizeForPut(data: any): any {
  const cleaned: any = {};
  for (const field of ["name", "nodes", "connections", "settings"]) {
    if (data[field] !== undefined) {
      cleaned[field] = data[field];
    }
  }
  // n8n API requiere 'settings' obligatoriamente — si no existe en el JSON, inyectar default
  if (!cleaned.settings) {
    cleaned.settings = { executionOrder: "v1" };
  }
  if (cleaned.nodes) {
    for (const node of cleaned.nodes) {
      for (const field of STRIP_FIELDS) {
        delete node[field];
      }
    }
  }
  return cleaned;
}

function verifyUpload(
  localData: any,
  serverData: any,
): { matched: boolean; divergences: string[] } {
  const divergences: string[] = [];
  const localNodes  = new Map((localData.nodes  || []).map((n: any) => [n.name, n]));
  const serverNodes = new Map((serverData.nodes || []).map((n: any) => [n.name, n]));

  if (localNodes.size !== serverNodes.size) {
    divergences.push(
      `Node count mismatch: local=${localNodes.size}, server=${serverNodes.size}`,
    );
  }

  for (const [name, localNode] of localNodes.entries()) {
    if (!serverNodes.has(name)) {
      divergences.push(`Node MISSING on server: '${name}'`);
      continue;
    }
    const serverNode = serverNodes.get(name);
    const lfp = { name: localNode.name, type: localNode.type, typeVersion: localNode.typeVersion };
    const sfp = { name: serverNode.name, type: serverNode.type, typeVersion: serverNode.typeVersion };
    for (const [key, lval] of Object.entries(lfp)) {
      const sval = (sfp as any)[key];
      if (lval !== sval) {
        divergences.push(
          `Node '${name}' [${key}]: local=${JSON.stringify(lval)} ≠ server=${JSON.stringify(sval)}`,
        );
      }
    }
  }
  return { matched: divergences.length === 0, divergences };
}

// ─── Helper: Fetch All Workflows ──────────────────────────────────────────────
async function fetchAllWorkflows(client: AxiosInstance, maxRetries: number = 3): Promise<any[]> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.get("/workflows");

      if (response.status === 401 || response.status === 403) {
        log.err(`Authentication failed (HTTP ${response.status})`);
        log.warn(`Check your API key in .env: N8N_API_KEY or X_N8N_API_KEY`);
        log.warn(`Generate a new key in: Settings → API → Create API Key`);
        throw new Error(`Authentication failed: HTTP ${response.status}`);
      }

      if (response.status >= 400) {
        log.warn(`Server returned HTTP ${response.status}`);
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          log.warn(`Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return [];
      }

      return response.data.data || [];
    } catch (e: any) {
      lastError = e;

      if (e.message?.includes('Authentication')) throw e;

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        log.warn(`Request failed: ${e.message}`);
        log.warn(`Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  log.warn(`Could not fetch workflows after ${maxRetries} attempts: ${lastError?.message}`);
  return [];
}

// ─── Helper: Build Name → ID Map ─────────────────────────────────────────────
function buildNameToIdMap(workflows: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const wf of workflows) {
    const name = wf.name;
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(wf);
  }
  return map;
}

// ─── Helper: Build ID → Name Map ─────────────────────────────────────────────
function buildIdToNameMap(workflows: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const wf of workflows) map.set(wf.id, wf);
  return map;
}

// ─── Helper: Get Most Recent Workflow ────────────────────────────────────────
function getMostRecent(workflows: any[]): any {
  return workflows.sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime(),
  )[0];
}

// ─── Helper: Update workflow_activation_order.json ───────────────────────────
interface WorkflowActivationEntry {
  name: string;
  id: string;
  order: number;
  webhook_path?: string;
  description?: string;
}

async function updateWorkflowIdsJson(
  workflows: any[],
  workflowIdsPath: string,
): Promise<boolean> {
  const nameToIdMap = buildNameToIdMap(workflows);
  let currentConfig: WorkflowActivationEntry[] = [];

  if (!fs.existsSync(workflowIdsPath)) {
    log.warn("workflow_activation_order.json does not exist - will create new file");
    for (const [, wfList] of nameToIdMap.entries()) {
      const mostRecent = getMostRecent(wfList);
      const webhookNode = (mostRecent.nodes || []).find(
        (n: any) => n.type === "n8n-nodes-base.webhook",
      );
      currentConfig.push({
        name: mostRecent.name,
        id: mostRecent.id,
        order: currentConfig.length + 1,
        webhook_path: webhookNode?.parameters?.path,
        description: mostRecent.description || undefined,
      });
    }
    currentConfig.sort((a, b) => a.order - b.order);
  } else {
    try {
      const fileContent = fs.readFileSync(workflowIdsPath, "utf-8");
      currentConfig = JSON.parse(fileContent);

      if (!Array.isArray(currentConfig)) throw new Error("File must contain a JSON array");

      for (let i = 0; i < currentConfig.length; i++) {
        const entry = currentConfig[i];
        if (!entry.name || typeof entry.name !== "string")
          throw new Error(`Entry ${i} missing or invalid 'name' field`);
        if (!entry.id || typeof entry.id !== "string")
          throw new Error(`Entry ${i} missing or invalid 'id' field`);
        if (entry.order === undefined || typeof entry.order !== "number")
          throw new Error(`Entry ${i} missing or invalid 'order' field`);
      }
    } catch (e: any) {
      log.err(`Failed to read/validate workflow_activation_order.json: ${e.message}`);
      const backupPath = workflowIdsPath + `.backup.${Date.now()}`;
      try {
        fs.copyFileSync(workflowIdsPath, backupPath);
        log.ok(`Backup created: ${backupPath}`);
      } catch (backupErr: any) {
        log.err(`Could not create backup: ${backupErr.message}`);
      }
      currentConfig = [];
    }
  }

  let updatedCount = 0;
  let addedCount   = 0;

  for (const item of currentConfig) {
    const wfs = nameToIdMap.get(item.name);
    if (wfs && wfs.length > 0) {
      const mostRecent = getMostRecent(wfs);
      if (item.id !== mostRecent.id) {
        log.info(`Updating ID for '${item.name}': ${item.id} → ${mostRecent.id}`);
        item.id = mostRecent.id;
        updatedCount++;
      }
      const webhookNode = (mostRecent.nodes || []).find(
        (n: any) => n.type === "n8n-nodes-base.webhook",
      );
      if (webhookNode?.parameters?.path && item.webhook_path !== webhookNode.parameters.path) {
        log.info(`Updating webhook_path for '${item.name}': ${item.webhook_path || "undefined"} → ${webhookNode.parameters.path}`);
        item.webhook_path = webhookNode.parameters.path;
      }
    } else {
      log.warn(`Workflow '${item.name}' not found on server - may have been deleted`);
    }
  }

  for (const [name, wfList] of nameToIdMap.entries()) {
    const existingEntry = currentConfig.find((e) => e.name === name);
    if (!existingEntry) {
      const mostRecent = getMostRecent(wfList);
      const webhookNode = (mostRecent.nodes || []).find(
        (n: any) => n.type === "n8n-nodes-base.webhook",
      );
      const maxOrder = currentConfig.length > 0
        ? Math.max(...currentConfig.map((e) => e.order))
        : 0;
      currentConfig.push({
        name: mostRecent.name,
        id: mostRecent.id,
        order: maxOrder + 1,
        webhook_path: webhookNode?.parameters?.path,
        description: mostRecent.description || undefined,
      });
      addedCount++;
      log.info(`Added new workflow to config: ${mostRecent.name}`);
    }
  }

  currentConfig.sort((a, b) => a.order - b.order);

  try {
    fs.writeFileSync(workflowIdsPath, JSON.stringify(currentConfig, null, 2) + "\n", "utf-8");
    if (updatedCount > 0 || addedCount > 0) {
      log.ok(`Updated workflow_activation_order.json: ${updatedCount} IDs modified, ${addedCount} workflows added`);
    } else {
      log.dim("workflow_activation_order.json is up to date");
    }
    return true;
  } catch (e: any) {
    log.err(`Failed to write workflow_activation_order.json: ${e.message}`);
    return false;
  }
}

// ─── Help Message ─────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${C.BOLD}n8n_push_v2.ts - Enhanced N8N Workflow Uploader${C.RESET}
═══════════════════════════════════════════════════════════════════════════════

${C.BOLD}USAGE:${C.RESET}
  npx tsx n8n_push_v2.ts [OPTIONS] --file <workflow.json>

${C.BOLD}REQUIRED:${C.RESET}
  One of:
    --name <name>, -n <name>      Workflow name (recommended, auto-resolves ID)
    --id <id>, -i <id>            Workflow ID (if you know it)

  And:
    --file <file>, -f <file>      Path to workflow JSON file

${C.BOLD}OPTIONS:${C.RESET}
  --activate, -a                  Activate workflow after upload
  --no-verify                     Skip pre-upload validation
  --watchdog <seconds>, -w <sec>  Watchdog timeout (default: 90)
  --force-deactivate              Force deactivate workflow before upload
  --no-sync-ids                   Skip workflow_activation_order.json update
  --url <url>                     Override N8N_API_URL
  --api-key <key>                 Override N8N_API_KEY
  --help, -h                      Show this help message

${C.BOLD}EXAMPLES:${C.RESET}
  ${C.CYAN}# Upload by name (recommended)${C.RESET}
  npx tsx n8n_push_v2.ts --name BB_01_Telegram_Gateway --file workflows/BB_01.json

  ${C.CYAN}# Upload and activate${C.RESET}
  npx tsx n8n_push_v2.ts -n BB_01_Telegram_Gateway -f workflows/BB_01.json -a

  ${C.CYAN}# Upload without validation${C.RESET}
  npx tsx n8n_push_v2.ts -n BB_01_Telegram_Gateway -f workflows/BB_01.json --no-verify

${C.BOLD}ENVIRONMENT VARIABLES:${C.RESET}
  N8N_API_URL / N8N_HOST          n8n instance URL
  N8N_API_KEY / X_N8N_API_KEY     API key (Settings → API → Create API Key)

${C.BOLD}EXIT CODES:${C.RESET}
  0   Success
  1   Error (validation failed, API error, etc.)
  3   Watchdog timeout

═══════════════════════════════════════════════════════════════════════════════
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  let args;
  try {
    args = parseArgs({
      options: {
        id:               { type: "string",  short: "i" },
        name:             { type: "string",  short: "n" },
        file:             { type: "string",  short: "f" },
        activate:         { type: "boolean", short: "a" },
        "no-verify":      { type: "boolean" },
        watchdog:         { type: "string",  short: "w", default: "90" },
        "force-deactivate": { type: "boolean" },
        "sync-ids":       { type: "boolean", default: true },
        url:              { type: "string" },
        "api-key":        { type: "string" },
        help:             { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
  } catch (err: any) {
    log.err(`Argument parsing error: ${err.message}`);
    process.exit(1);
  }

  const { values } = args;

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  if ((!values.id && !values.name) || !values.file) {
    log.err("Missing required arguments: --id or --name, and --file are required.");
    console.error(`\nUse --help for more information`);
    process.exit(1);
  }

  const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
  watchdog.start();

  try {
    // FIX v2.1: loadConfig ya no retorna isJwtToken
    const { client, baseUrl } = loadConfig({
      url:    values.url,
      apiKey: values["api-key"],
    });

    // ── Connection test ──────────────────────────────────────────────────────
    log.info("Testing connection to n8n server...");
    log.dim(`   URL: ${baseUrl}`);
    log.dim(`   Auth: X-N8N-API-KEY`);

    const testResponse = await client.get("/workflows?limit=1");

    if (testResponse.status === 401 || testResponse.status === 403) {
      log.err(`Authentication failed (HTTP ${testResponse.status})`);
      log.err(`\nSteps to fix:`);
      log.err(`  1. Go to ${baseUrl.replace('/api/v1', '')}`);
      log.err(`  2. Settings → API → Create API Key`);
      log.err(`  3. Copy the key and update .env: N8N_API_KEY=<your-key>`);
      watchdog.cancel();
      process.exit(1);
    }

    if (testResponse.status >= 400) {
      log.warn(`Server returned HTTP ${testResponse.status} - continuing...`);
    } else {
      log.ok(`Connection successful`);
    }

    const workflowIdsPath = path.join(__dirname, "workflow_activation_order.json");

    // ── Resolve file path ──
    let filePath = path.resolve(values.file as string);
    if (!path.isAbsolute(values.file as string)) {
      const workspaceDir = process.cwd();
      const candidate1 = path.join(workspaceDir, "workflows", values.file as string);
      const candidate2 = path.join(workspaceDir, "workflows", path.basename(values.file as string));
      // FIX: usar fs.existsSync en vez de fs.access (que es callback, no Promise)
      if (fs.existsSync(candidate1)) {
        filePath = candidate1;
      } else if (fs.existsSync(candidate2)) {
        filePath = candidate2;
      }
    }

    // ── Load local data ──
    log.info(`Loading: ${path.basename(filePath)}`);
    let localData: any;
    try {
      localData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e: any) {
      log.err(`Failed to read/parse local file: ${e.message}`);
      return process.exit(1);
    }

    // ── [1/6] Pre-upload validation ──────────────────────────────────────────
    console.log(`\n${C.BOLD}[1/6] Pre-upload validation${C.RESET}`);
    try {
      const warnings = validateLocal(localData);
      for (const w of warnings) log.warn(w);
    } catch (e: any) {
      log.err(`Validation FAILED: ${e.message}`);
      return process.exit(1);
    }

    const verErrs = validateNodeVersions(localData, "LOCAL");
    if (verErrs.length > 0) {
      log.err("SOT Version Validation FAILED pre-upload:");
      for (const e of verErrs) console.error(`${C.RED}    • ${e}${C.RESET}`);
      return process.exit(1);
    }
    log.ok("Local schema looks good");

    // ── [2/6] Extended validation ────────────────────────────────────────────
    if (!values["no-verify"]) {
      console.log(`\n${C.BOLD}[2/6] Extended validation (Native TypeScript)${C.RESET}`);
      log.info(`Scanning workflow for code patterns...`);
      const { errors: valErrors, warnings: valWarnings } = validateWorkflow(localData);

      if (valErrors.length > 0) {
        log.err(`Extended validation FAILED: ${valErrors.length} error(s):`);
        console.log(`\n${C.RED}${"═".repeat(63)}${C.RESET}`);
        console.log(`${C.RED}📍 ERROR DETAILS:${C.RESET}`);
        console.log(`${C.RED}${"═".repeat(63)}${C.RESET}\n`);

        const errorsByNode = new Map<string, any[]>();
        for (const err of valErrors) {
          if (!errorsByNode.has(err.node)) errorsByNode.set(err.node, []);
          errorsByNode.get(err.node)!.push(err);
        }

        for (const [nodeName, errors] of errorsByNode.entries()) {
          console.log(`\n${C.BOLD}${C.YELLOW}Node: ${nodeName}${C.RESET}`);
          console.log(`${C.GREY}${"─".repeat(60)}${C.RESET}`);
          for (const err of errors) {
            console.log(`  ${C.RED}❌ [${err.patternId}]${C.RESET}`);
            console.log(`     ${C.WHITE}Issue:${C.RESET} ${err.description}`);
            if (err.context) {
              console.log(`     ${C.WHITE}Found:${C.RESET} ${C.GREY}"${err.context.substring(0, 50)}${err.context.length > 50 ? "..." : ""}"${C.RESET}`);
            }
            console.log();
          }
        }

        console.log(`\n${C.RED}${"═".repeat(63)}${C.RESET}`);
        console.log(`${C.YELLOW}Fix the issues above and re-run, or use --no-verify to skip${C.RESET}\n`);
        return process.exit(1);
      }

      if (valWarnings.length > 0) {
        log.warn(`Extended validation: ${valWarnings.length} warning(s):`);
        for (const warn of valWarnings) {
          console.log(`  ${C.YELLOW}⚠️  [${warn.patternId}] ${warn.node}: ${warn.description}${C.RESET}`);
        }
        console.log();
      }

      log.ok("Extended validation PASSED");
    } else {
      console.log(`\n${C.BOLD}[2/6] Extended validation${C.RESET} — skipped (--no-verify)`);
    }

    // ── [2.5/6] Bidirectional Verification ──────────────────────────────────
    console.log(`\n${C.BOLD}[2.5/6] Bidirectional Verification${C.RESET}`);

    let workflowId   = values.id as string;
    const workflowName = localData.name || path.basename(filePath, ".json");

    log.info("Fetching workflows from server...");
    const serverWorkflows = await fetchAllWorkflows(client);
    const nameToIdMap     = buildNameToIdMap(serverWorkflows);
    const idToNameMap     = buildIdToNameMap(serverWorkflows);

    if (values.name) {
      const matches = nameToIdMap.get(values.name) || [];

      if (matches.length === 0) {
        log.info(`Workflow '${values.name}' not found on server - will CREATE NEW`);
        workflowId = "";
      } else if (matches.length === 1) {
        workflowId = matches[0].id;
        log.ok(`Found workflow: ${workflowId} - will UPDATE`);
      } else {
        log.warn(`⚠️  DUPLICATE DETECTED: ${matches.length} workflows with name '${values.name}'`);
        const mostRecent = getMostRecent(matches);
        console.log("\nWorkflows found:");
        matches.forEach((wf, i) => {
          const marker = wf.id === mostRecent.id ? "👉 MOST RECENT" : "";
          console.log(`  ${i + 1}. ${wf.id} (updated: ${wf.updatedAt}, active: ${wf.active}) ${marker}`);
        });
        workflowId = mostRecent.id;
        log.info(`Auto-selected most recent: ${workflowId}`);
      }
    } else if (values.id) {
      const workflow = idToNameMap.get(values.id);
      if (!workflow) {
        log.warn(`⚠️  Workflow ID '${values.id}' not found on server - will CREATE NEW`);
      } else {
        log.ok(`Found workflow: ${values.id} (${workflow.name}) - will UPDATE`);
        const matches = nameToIdMap.get(workflow.name) || [];
        if (matches.length > 1) {
          const mostRecent = getMostRecent(matches);
          if (values.id !== mostRecent.id) {
            log.warn(`   Provided ID may be outdated — auto-switching to most recent: ${mostRecent.id}`);
            workflowId = mostRecent.id;
          }
        }
      }
    }

    // Validate workflow_activation_order.json sync
    console.log(`\n${C.BOLD}[2.5/6] Checking workflow_activation_order.json sync${C.RESET}`);
    try {
      if (!fs.existsSync(workflowIdsPath)) {
        log.warn("workflow_activation_order.json does not exist - will be created after upload");
      } else {
        const localConfig: any[] = JSON.parse(fs.readFileSync(workflowIdsPath, "utf-8"));
        const localEntry = localConfig.find((w) => w.name === workflowName);
        const localId = localEntry ? localEntry.id : null;

        if (localId && localId !== workflowId) {
          log.warn(`⚠️  workflow_activation_order.json is OUTDATED!`);
          log.warn(`   Local:  ${localId}`);
          log.warn(`   Server: ${workflowId}`);
          if (values["sync-ids"] !== false) {
            log.info("Will auto-update after successful upload...");
          }
        } else if (localEntry) {
          log.dim(`workflow_activation_order.json is in sync for '${workflowName}'`);
        } else {
          log.info(`'${workflowName}' not in workflow_activation_order.json - will be added after upload`);
        }
      }
    } catch (e: any) {
      log.warn(`Could not check workflow_activation_order.json: ${e.message}`);
    }

    // ── Sanitize ──
    const payload = sanitizeForPut(localData);

    // ── [3/6] Upload ─────────────────────────────────────────────────────────
    console.log(`\n${C.BOLD}[3/6] Uploading to server${C.RESET}`);

    let workflowExists = false;
    if (workflowId) {
      try {
        const checkResp = await retryableRequest(() => client.get(`/workflows/${workflowId}`));
        if (checkResp.status === 200) {
          workflowExists = true;
          log.dim(`    Workflow exists (createdAt: ${checkResp.data.createdAt})`);
        }
      } catch (e: any) {
        log.dim(`    Workflow does not exist - will create`);
      }
    }

    let wasActive   = false;
    let deactivated = false;

    if (workflowExists) {
      try {
        const checkR = await retryableRequest(() => client.get(`/workflows/${workflowId}`));
        if (checkR.status === 200) {
          wasActive = !!checkR.data.active;
          if (wasActive) log.dim("    Workflow is currently active");
        }
      } catch (e) {}

      if (wasActive || values["force-deactivate"]) {
        log.info("Deactivating workflow before upload...");
        try {
          const dr = await client.post(`/workflows/${workflowId}/deactivate`);
          if (dr.status === 200) {
            deactivated = true;
            log.dim("    → deactivated");
          } else {
            log.warn(`Could not deactivate (${dr.status})`);
          }
        } catch (e: any) {
          log.warn(`Deactivate error: ${e.message}`);
        }
      }
    }

    let resp: AxiosResponse;
    let elapsed: number;
    try {
      const t0 = performance.now();
      if (workflowExists && workflowId) {
        log.info(`PUT /workflows/${workflowId} (update existing workflow)`);
        log.dim(`    Payload size: ${JSON.stringify(payload).length} bytes`);
        log.dim(`    Nodes: ${payload.nodes?.length || 0}`);
        resp = await retryableRequest(() => client.put(`/workflows/${workflowId}`, payload));
      } else {
        log.info(`POST /workflows (create new workflow)`);
        log.dim(`    Workflow name: ${payload.name}`);
        resp = await retryableRequest(() => client.post("/workflows", payload));
        if (resp.status === 200 && resp.data.id) {
          workflowId = resp.data.id;
          log.ok(`Created workflow with ID: ${workflowId}`);
        }
      }
      elapsed = (performance.now() - t0) / 1000;
      log.dim(`    → ${resp.status} in ${elapsed.toFixed(1)}s`);
    } catch (e: any) {
      log.err(`Upload FAILED: ${e.message}`);
      if (e.response?.data) {
        log.err(`Server response: ${JSON.stringify(e.response.data).substring(0, 500)}`);
      }
      return process.exit(1);
    }

    if (resp.status === 400) {
      log.err(`Upload rejected (400): ${JSON.stringify(resp.data).substring(0, 500)}`);
      return process.exit(1);
    } else if (resp.status !== 200) {
      log.err(`Upload FAILED: ${resp.status}`);
      return process.exit(1);
    }

    log.ok(`Upload successful (${elapsed!.toFixed(1)}s)`);

    // ── [4/6] Post-upload verification ───────────────────────────────────────
    if (!values["no-verify"] && workflowId) {
      console.log(`\n${C.BOLD}[4/6] Post-upload verification${C.RESET}`);
      try {
        const t0 = performance.now();
        const getResp = await retryableRequest(() => client.get(`/workflows/${workflowId}`));
        log.dim(`    → ${getResp.status} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

        if (getResp.status === 200) {
          const serverData = getResp.data;
          let { matched, divergences } = verifyUpload(localData, serverData);
          const verErrsSrv = validateNodeVersions(serverData, "SERVER");
          divergences.push(...verErrsSrv);
          if (verErrsSrv.length > 0) matched = false;

          if (matched) {
            log.ok("Verification PASSED — local ≡ server & versions OK ✓");
          } else {
            log.err(`Verification FAILED — ${divergences.length} divergence(s):`);
            for (const d of divergences) console.error(`${C.RED}    • ${d}${C.RESET}`);
            return process.exit(2);
          }
        }
      } catch (e: any) {
        log.warn(`Could not verify: ${e.message}`);
      }
    } else {
      console.log(`\n${C.BOLD}[4/6] Verification${C.RESET} — skipped`);
    }

    // ── [5/6] Activate ───────────────────────────────────────────────────────
    console.log(`\n${C.BOLD}[5/6] Activate${C.RESET}`);
    if (values.activate && workflowId) {
      log.info(`Activating workflow ${workflowId}...`);
      try {
        const activateResp = await client.post(`/workflows/${workflowId}/activate`);
        if (activateResp.status === 200) {
          log.ok("Workflow activated ✓");
        } else if (activateResp.status === 400) {
          log.err(`Activation FAILED (400): ${activateResp.data?.message}`);

          const msg = activateResp.data?.message || "";
          if (msg.includes("references workflow") && msg.includes("not published")) {
            const refMatches = msg.match(/Node "([^"]+)" references workflow ([\w]+) which is not published/g);
            if (refMatches) {
              log.err(`Sub-workflows not active — activate them first:`);
              for (const match of refMatches) {
                const nodeMatch = match.match(/Node "([^"]+)"/);
                const wfMatch   = match.match(/workflow ([\w]+)/);
                if (nodeMatch && wfMatch) {
                  log.err(`    • ${C.YELLOW}${nodeMatch[1]}${C.RESET} → ID: ${C.GREY}${wfMatch[1]}${C.RESET}`);
                }
              }
            }
          }
        } else {
          log.warn(`Could not activate (${activateResp.status})`);
        }
      } catch (e: any) {
        log.err(`Activation error: ${e.message}`);
      }
    } else if (deactivated && wasActive && workflowId) {
      log.info("Restoring previous active state...");
      try {
        const ra = await client.post(`/workflows/${workflowId}/activate`);
        if (ra.status === 200) log.ok("Workflow re-activated ✓");
        else log.warn(`Could not re-activate (${ra.status})`);
      } catch (e: any) {
        log.warn(`Re-activate error: ${e.message}`);
      }
    } else {
      if (values.activate) {
        log.warn(`Cannot activate - workflowId not available`);
      } else {
        console.log(` — skipped (pass --activate to enable)`);
      }
    }

    // ── [6/6] Sync workflow_activation_order.json ────────────────────────────
    console.log(`\n${C.BOLD}[6/6] Sync workflow_activation_order.json${C.RESET}`);
    if (values["sync-ids"] !== false) {
      log.info("Fetching latest workflow list from server...");
      const updatedWorkflows = await fetchAllWorkflows(client);
      const success = await updateWorkflowIdsJson(updatedWorkflows, workflowIdsPath);
      if (!success) {
        log.warn("workflow_activation_order.json sync failed - manual update may be required");
      }
    } else {
      console.log(` — skipped (--no-sync-ids)`);
    }

    console.log(`\n${C.GREEN}${C.BOLD}All done!${C.RESET}`);
  } finally {
    watchdog.cancel();
  }
}

run().catch((e) => {
  log.err(`Fatal error: ${e.message}`);
  console.error(e);
  process.exit(1);
});
