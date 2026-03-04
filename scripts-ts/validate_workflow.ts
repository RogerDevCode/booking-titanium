#!/usr/bin/env npx tsx
// ══════════════════════════════════════════════════════════════
// validate_workflow.ts v2 — N8N Workflow Validator con Live Discovery
//
// Consulta tu instancia n8n real para obtener los node types
// instalados y sus versiones disponibles. Valida contra eso.
//
// Uso:
//   npx tsx scripts-ts/validate_workflow.ts <workflow.json>
//   npx tsx scripts-ts/validate_workflow.ts <workflow.json> --live
//   npx tsx scripts-ts/validate_workflow.ts <workflow.json> --refresh
//   npx tsx scripts-ts/validate_workflow.ts --discover-only
//
// Flags:
//   --live          Consulta la API en cada ejecución (no usa caché)
//   --refresh       Fuerza re-descubrimiento y actualiza caché
//   --discover-only Solo descubre node types y guarda caché (no valida)
//   --verbose       Muestra detalles extra de discovery
//   --help          Muestra ayuda
//
// Requiere .env con:
//   N8N_API_URL=https://n8n.stax.ink
//   N8N_API_KEY=tu-api-key
//   N8N_ACCESS_TOKEN=tu-access-token
//
// Compatible: n8n v2.10.2+
// ══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "fs";
import { basename, resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── __dirname para ESM ───────────────────────────────────────
const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);

// ─── Colores ANSI ─────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
};

// ─── Tipos ────────────────────────────────────────────────────
interface N8NNode {
  id?: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  disabled?: boolean;
}

interface N8NConnectionTarget {
  node: string;
  type: string;
  index: number;
}

type N8NConnections = Record<string, Record<string, N8NConnectionTarget[][]>>;

interface N8NWorkflow {
  id?: string;
  name?: string;
  nodes?: N8NNode[];
  connections?: N8NConnections;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  tags?: unknown[];
  pinData?: Record<string, unknown>;
}

type Severity = "FATAL" | "ERROR" | "WARN" | "INFO";

interface Finding {
  severity: Severity;
  category: string;
  message: string;
  node?: string;
  fix?: string;
}

interface DiscoveredNodeType {
  displayName: string;
  availableVersions: number[];
  latestVersion: number;
  group: string[];
  description?: string;
}

interface NodeTypeCache {
  discoveredAt: string;
  n8nBaseUrl: string;
  totalTypes: number;
  nodeTypes: Record<string, DiscoveredNodeType>;
}

interface EnvConfig {
  apiUrl: string;
  apiKey: string;
  accessToken: string;
}

interface ResolvedSOT {
  source: "live" | "cache" | "fallback";
  sourceDetail: string;
  nodeTypes: Record<string, DiscoveredNodeType>;
}

// ─── Fallback SOT (cuando la API no está disponible) ──────────
const FALLBACK_SOT: Record<
  string,
  { min: number; recommended: number; label: string }
> = {
  "n8n-nodes-base.if": {
    min: 2.3,
    recommended: 2.3,
    label: "IF (CRÍTICO: v1→propertyValues error)",
  },
  "n8n-nodes-base.switch": { min: 3.4, recommended: 3.4, label: "Switch" },
  "n8n-nodes-base.code": { min: 2, recommended: 2, label: "Code" },
  "n8n-nodes-base.telegram": { min: 1.2, recommended: 1.2, label: "Telegram" },
  "n8n-nodes-base.googleCalendar": {
    min: 1.3,
    recommended: 1.3,
    label: "Google Calendar",
  },
  "n8n-nodes-base.executeWorkflow": {
    min: 1.3,
    recommended: 1.3,
    label: "Execute Workflow",
  },
  "n8n-nodes-base.executeWorkflowTrigger": {
    min: 1.1,
    recommended: 1.1,
    label: "Execute Workflow Trigger",
  },
  "n8n-nodes-base.webhook": { min: 2.1, recommended: 2.1, label: "Webhook" },
  "n8n-nodes-base.manualTrigger": {
    min: 1,
    recommended: 1,
    label: "Manual Trigger",
  },
  "n8n-nodes-base.scheduleTrigger": {
    min: 1.3,
    recommended: 1.3,
    label: "Schedule Trigger",
  },
  "n8n-nodes-base.httpRequest": {
    min: 4.4,
    recommended: 4.4,
    label: "HTTP Request",
  },
  "n8n-nodes-base.set": { min: 3.4, recommended: 3.4, label: "Set" },
  "n8n-nodes-base.postgres": { min: 2.6, recommended: 2.6, label: "Postgres" },
};

const CACHE_FILENAME = ".n8n-node-types-cache.json";

const ICONS: Record<Severity, string> = {
  FATAL: `${C.red}✖ FATAL${C.reset}`,
  ERROR: `${C.red}✘ ERROR${C.reset}`,
  WARN: `${C.yellow}⚠ WARN ${C.reset}`,
  INFO: `${C.cyan}ℹ INFO ${C.reset}`,
};

const TRIGGER_TYPES = new Set([
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.executeWorkflowTrigger",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.emailTrigger",
  "n8n-nodes-base.telegramTrigger",
  "n8n-nodes-base.cronTrigger",
  "n8n-nodes-base.errorTrigger",
  "n8n-nodes-base.formTrigger",
  "n8n-nodes-base.chatTrigger",
]);

const isTrigger = (type: string): boolean =>
  TRIGGER_TYPES.has(type) || type.toLowerCase().includes("trigger");

// ══════════════════════════════════════════════════════════════
//  .ENV LOADER
// ══════════════════════════════════════════════════════════════

function loadEnv(): EnvConfig {
  const envPaths = [
    resolve(__dirname_local, "..", ".env"),
    resolve(process.cwd(), ".env"),
  ];

  let envContent = "";
  for (const p of envPaths) {
    if (existsSync(p)) {
      envContent = readFileSync(p, "utf-8");
      break;
    }
  }

  const vars: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }

  return {
    apiUrl:
      vars["N8N_API_URL"] || process.env.N8N_API_URL || "https://n8n.stax.ink",
    apiKey: vars["N8N_API_KEY"] || process.env.N8N_API_KEY || "",
    accessToken: vars["N8N_ACCESS_TOKEN"] || process.env.N8N_ACCESS_TOKEN || "",
  };
}

// ══════════════════════════════════════════════════════════════
//  DISCOVERY: Consultar n8n por node types instalados
// ══════════════════════════════════════════════════════════════

function getBaseUrl(apiUrl: string): string {
  let base = apiUrl
    .replace(/\/api\/v\d+\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");
  return base;
}

function normalizeVersions(version: unknown): number[] {
  if (typeof version === "number") return [version];
  if (Array.isArray(version)) {
    return version
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);
  }
  return [];
}

async function tryEndpoint(
  url: string,
  auth: { apiKey: string; accessToken: string },
  method: "GET" | "POST",
  body?: unknown,
  verbose?: boolean,
): Promise<unknown[] | null> {
  try {
    if (verbose) console.log(`  ${C.gray}→ ${method} ${url}${C.reset}`);

    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };

    if (auth.accessToken) {
      headers["authorization"] = `Bearer ${auth.accessToken}`;
    }
    if (auth.apiKey) {
      headers["x-n8n-api-key"] = auth.apiKey;
    }

    if (verbose) {
      const authMethods: string[] = [];
      if (auth.apiKey) authMethods.push("API Key");
      if (auth.accessToken) authMethods.push("Bearer Token");
      console.log(
        `  ${C.gray}  Auth: ${authMethods.join(" + ") || "NINGUNA"}${C.reset}`,
      );
    }

    const opts: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(15_000),
    };
    if (body && method === "POST") {
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);

    if (verbose) console.log(`  ${C.gray}  ← HTTP ${resp.status}${C.reset}`);

    if (!resp.ok) return null;

    const json = (await resp.json()) as unknown;

    if (Array.isArray(json)) return json;
    if (
      json &&
      typeof json === "object" &&
      "data" in json &&
      Array.isArray((json as Record<string, unknown>).data)
    ) {
      return (json as Record<string, unknown>).data as unknown[];
    }

    if (verbose) console.log(`  ${C.gray}  ← Respuesta no es array${C.reset}`);
    return null;
  } catch (err) {
    if (verbose)
      console.log(`  ${C.gray}  ← Error: ${(err as Error).message}${C.reset}`);
    return null;
  }
}

async function discoverNodeTypes(
  env: EnvConfig,
  verbose: boolean,
): Promise<NodeTypeCache | null> {
  const baseUrl = getBaseUrl(env.apiUrl);

  if (!baseUrl) {
    console.log(
      `  ${C.yellow}⚠ N8N_API_URL no configurado — usando fallback SOT${C.reset}`,
    );
    return null;
  }

  const auth = { apiKey: env.apiKey, accessToken: env.accessToken };

  const detected: string[] = [];
  if (env.apiKey) detected.push("N8N_API_KEY ✓");
  if (env.accessToken) detected.push("N8N_ACCESS_TOKEN ✓");
  if (detected.length === 0) detected.push("⚠ NINGUNA — requests sin auth");

  console.log(`\n  ${C.bold}🔍 Descubriendo node types${C.reset}`);
  console.log(`  ${C.gray}URL:${C.reset}  ${baseUrl}`);
  console.log(`  ${C.gray}Auth:${C.reset} ${detected.join(", ")}`);
  console.log("");

  const endpoints: Array<{
    url: string;
    method: "GET" | "POST";
    body?: unknown;
    label: string;
    isConnTest?: boolean;
  }> = [
    {
      url: `${baseUrl}/rest/node-types`,
      method: "POST",
      body: {},
      label: "POST /rest/node-types (bearer)",
    },
    {
      url: `${baseUrl}/rest/node-types`,
      method: "GET",
      label: "GET /rest/node-types",
    },
    {
      url: `${baseUrl}/types/nodes.json`,
      method: "GET",
      label: "GET /types/nodes.json (static)",
    },
    {
      url: `${baseUrl}/rest/nodes`,
      method: "GET",
      label: "GET /rest/nodes",
    },
    {
      url: `${baseUrl}/api/v1/workflows?limit=1`,
      method: "GET",
      label: "GET /api/v1/workflows (connectivity test)",
      isConnTest: true,
    },
  ];

  let rawTypes: unknown[] | null = null;
  let successLabel = "";

  for (const ep of endpoints) {
    if (ep.isConnTest) {
      const testResult = await tryEndpoint(
        ep.url,
        auth,
        ep.method,
        ep.body,
        verbose,
      );
      if (testResult !== null && verbose) {
        console.log(`  ${C.green}  ✔ Conexión OK con API key${C.reset}`);
      }
      continue;
    }

    rawTypes = await tryEndpoint(ep.url, auth, ep.method, ep.body, verbose);
    if (rawTypes && rawTypes.length > 0) {
      successLabel = ep.label;
      break;
    }
  }

  if (!rawTypes || rawTypes.length === 0) {
    console.log(`  ${C.yellow}⚠ No se pudieron obtener node types${C.reset}`);
    console.log(`  ${C.gray}  Posibles causas:${C.reset}`);
    console.log(
      `  ${C.gray}  • N8N_ACCESS_TOKEN necesario para /rest/* (UI session token)${C.reset}`,
    );
    console.log(
      `  ${C.gray}  • N8N_API_KEY solo funciona con /api/v1/* (no expone node types)${C.reset}`,
    );
    console.log(`  ${C.gray}  • Reverse proxy bloqueando /rest/*${C.reset}`);
    console.log(`  ${C.gray}  → Usando fallback SOT hardcodeado${C.reset}\n`);
    return null;
  }

  console.log(`  ${C.green}✔ Éxito via ${successLabel}${C.reset}`);

  const nodeTypes: Record<string, DiscoveredNodeType> = {};

  for (const raw of rawTypes) {
    if (!raw || typeof raw !== "object") continue;

    const entry = raw as Record<string, unknown>;
    const name = entry.name as string | undefined;
    if (!name || typeof name !== "string") continue;

    const versions = normalizeVersions(entry.version);
    if (versions.length === 0) continue;

    const displayName =
      (entry.displayName as string) || name.split(".").pop() || name;
    const group = Array.isArray(entry.group) ? (entry.group as string[]) : [];
    const description = (entry.description as string) || undefined;

    nodeTypes[name] = {
      displayName,
      availableVersions: versions,
      latestVersion: versions[versions.length - 1],
      group,
      description,
    };
  }

  const totalTypes = Object.keys(nodeTypes).length;
  console.log(
    `  ${C.green}✔ ${totalTypes} node types descubiertos${C.reset}\n`,
  );

  return {
    discoveredAt: new Date().toISOString(),
    n8nBaseUrl: baseUrl,
    totalTypes,
    nodeTypes,
  };
}

// ── Cache management ──────────────────────────────────────────
function getCachePath(): string {
  return resolve(__dirname_local, "..", CACHE_FILENAME);
}

function loadCache(): NodeTypeCache | null {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return null;

  try {
    const raw = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as NodeTypeCache;
    if (!parsed.nodeTypes || typeof parsed.nodeTypes !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(cache: NodeTypeCache): void {
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf-8");
  console.log(`  ${C.green}✔ Caché guardado: ${cachePath}${C.reset}`);
  console.log(
    `  ${C.gray}  (Agregar ${CACHE_FILENAME} a .gitignore)${C.reset}\n`,
  );
}

// ══════════════════════════════════════════════════════════════
//  SOT RESOLUTION: Dynamic (API) → Cache → Fallback
// ══════════════════════════════════════════════════════════════

async function resolveSOT(flags: {
  live: boolean;
  refresh: boolean;
  verbose: boolean;
}): Promise<ResolvedSOT> {
  const env = loadEnv();

  if (flags.live || flags.refresh) {
    const discovered = await discoverNodeTypes(env, flags.verbose);
    if (discovered) {
      if (flags.refresh) saveCache(discovered);
      return {
        source: "live",
        sourceDetail: `API ${discovered.n8nBaseUrl} (${discovered.totalTypes} types)`,
        nodeTypes: discovered.nodeTypes,
      };
    }
  }

  if (!flags.live) {
    const cached = loadCache();
    if (cached) {
      const ageHours = Math.round(
        (Date.now() - new Date(cached.discoveredAt).getTime()) / 3600000,
      );
      if (ageHours > 24) {
        console.log(
          `  ${C.yellow}⚠ Caché tiene ${ageHours}h — considera --refresh${C.reset}`,
        );
      }
      return {
        source: "cache",
        sourceDetail: `${getCachePath()} (${cached.totalTypes} types, ${ageHours}h)`,
        nodeTypes: cached.nodeTypes,
      };
    }

    if (!flags.refresh) {
      console.log(`  ${C.gray}Sin caché. Auto-discovery...${C.reset}`);
      const discovered = await discoverNodeTypes(env, flags.verbose);
      if (discovered) {
        saveCache(discovered);
        return {
          source: "live",
          sourceDetail: `API ${discovered.n8nBaseUrl} (auto, ${discovered.totalTypes} types)`,
          nodeTypes: discovered.nodeTypes,
        };
      }
    }
  }

  console.log(
    `  ${C.yellow}⚠ Fallback SOT (${Object.keys(FALLBACK_SOT).length} tipos)${C.reset}\n`,
  );
  const fallbackTypes: Record<string, DiscoveredNodeType> = {};
  for (const [name, info] of Object.entries(FALLBACK_SOT)) {
    fallbackTypes[name] = {
      displayName: info.label,
      availableVersions: [info.recommended],
      latestVersion: info.recommended,
      group: [],
    };
  }

  return {
    source: "fallback",
    sourceDetail: `SOT hardcodeado (${Object.keys(FALLBACK_SOT).length} tipos)`,
    nodeTypes: fallbackTypes,
  };
}

// ══════════════════════════════════════════════════════════════
//  VALIDATION CHECKS
// ══════════════════════════════════════════════════════════════

function checkStructure(wf: N8NWorkflow, findings: Finding[]): boolean {
  if (!wf.name || typeof wf.name !== "string" || wf.name.trim() === "") {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: "Workflow sin nombre o nombre vacío.",
      fix: 'Agregar campo "name" con valor descriptivo.',
    });
  }

  if (!Array.isArray(wf.nodes)) {
    findings.push({
      severity: "FATAL",
      category: "STRUCTURE",
      message: '"nodes" no es un array o no existe.',
      fix: 'El campo "nodes" debe ser un array de objetos.',
    });
    return false;
  }

  if (wf.nodes.length === 0) {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: "Workflow sin nodos (array vacío).",
    });
    return false;
  }

  if (!wf.connections || typeof wf.connections !== "object") {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: '"connections" falta o no es un objeto.',
      fix: 'Agregar campo "connections": {}.',
    });
  }

  return true;
}

function checkNodeFields(nodes: N8NNode[], findings: Finding[]): void {
  const required: (keyof N8NNode)[] = [
    "name",
    "type",
    "typeVersion",
    "position",
  ];

  nodes.forEach((node, idx) => {
    for (const field of required) {
      if (node[field] === undefined || node[field] === null) {
        findings.push({
          severity: "ERROR",
          category: "NODE_FIELD",
          message: `Campo "${field}" faltante.`,
          node: node.name || `[índice ${idx}]`,
          fix: `Agregar "${field}" al nodo.`,
        });
      }
    }

    if (node.position) {
      if (
        !Array.isArray(node.position) ||
        node.position.length !== 2 ||
        typeof node.position[0] !== "number" ||
        typeof node.position[1] !== "number"
      ) {
        findings.push({
          severity: "WARN",
          category: "NODE_FIELD",
          message: '"position" debe ser [number, number].',
          node: node.name,
        });
      }
    }

    if (
      node.typeVersion !== undefined &&
      (typeof node.typeVersion !== "number" || node.typeVersion <= 0)
    ) {
      findings.push({
        severity: "ERROR",
        category: "NODE_FIELD",
        message: `typeVersion inválido: ${node.typeVersion}. Debe ser > 0.`,
        node: node.name,
      });
    }
  });
}

function checkDuplicateNames(nodes: N8NNode[], findings: Finding[]): void {
  const seen = new Map<string, number>();
  for (const node of nodes) {
    if (!node.name) continue;
    seen.set(node.name, (seen.get(node.name) || 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1) {
      findings.push({
        severity: "ERROR",
        category: "DUPLICATE",
        message: `Nombre "${name}" duplicado ×${count}. n8n usa nombres como key en connections.`,
        node: name,
        fix: "Renombrar para que cada nodo sea único.",
      });
    }
  }
}

function checkDuplicateIds(nodes: N8NNode[], findings: Finding[]): void {
  const seen = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.id) continue;
    if (!seen.has(node.id)) seen.set(node.id, []);
    seen.get(node.id)!.push(node.name);
  }
  for (const [id, names] of seen) {
    if (names.length > 1) {
      findings.push({
        severity: "ERROR",
        category: "DUPLICATE",
        message: `ID "${id}" compartido por: ${names.join(", ")}.`,
        node: names[0],
        fix: "Cada nodo debe tener un UUID único.",
      });
    }
  }
}

function checkNodeTypesAndVersions(
  nodes: N8NNode[],
  sot: ResolvedSOT,
  findings: Finding[],
): void {
  for (const node of nodes) {
    if (node.disabled) continue;

    const known = sot.nodeTypes[node.type];

    if (!known) {
      if (node.type.startsWith("n8n-nodes-base.") && sot.source === "live") {
        findings.push({
          severity: "ERROR",
          category: "NODE_TYPE",
          message: `Tipo "${node.type}" NO está instalado en tu instancia n8n.`,
          node: node.name,
          fix: "Verificar que el node package está instalado, o cambiar a un tipo disponible.",
        });
      } else if (node.type.startsWith("@n8n/")) {
        if (sot.source === "live") {
          findings.push({
            severity: "ERROR",
            category: "NODE_TYPE",
            message: `Tipo "${node.type}" NO encontrado en tu instancia.`,
            node: node.name,
            fix: "Verificar que el paquete langchain está instalado.",
          });
        } else {
          findings.push({
            severity: "INFO",
            category: "NODE_TYPE",
            message: `Tipo langchain "${node.type}" — no validable con fallback SOT.`,
            node: node.name,
          });
        }
      } else if (
        !node.type.startsWith("n8n-nodes-base.") &&
        !node.type.startsWith("@n8n/")
      ) {
        findings.push({
          severity: "INFO",
          category: "NODE_TYPE",
          message: `Tipo community/custom: "${node.type}". Verificar que está instalado.`,
          node: node.name,
        });
      }
      continue;
    }

    const usedVersion = node.typeVersion;
    const available = known.availableVersions;
    const latest = known.latestVersion;

    if (!available.includes(usedVersion)) {
      const isCritical = node.type === "n8n-nodes-base.if" && usedVersion < 2;

      findings.push({
        severity: isCritical ? "FATAL" : "ERROR",
        category: "VERSION",
        message:
          `v${usedVersion} NO disponible para ${known.displayName}. ` +
          `Versiones instaladas: [${available.join(", ")}].` +
          (isCritical
            ? ' CAUSA: "propertyValues[itemName] is not iterable"'
            : ""),
        node: node.name,
        fix: `Cambiar typeVersion a ${latest} (latest disponible).`,
      });
    } else if (usedVersion < latest) {
      findings.push({
        severity: "WARN",
        category: "VERSION",
        message: `v${usedVersion} es válida pero v${latest} es la más reciente para ${known.displayName}.`,
        node: node.name,
        fix: `Considerar actualizar typeVersion a ${latest}.`,
      });
    }
  }
}

function checkConnections(
  nodes: N8NNode[],
  connections: N8NConnections,
  findings: Finding[],
): { inbound: Map<string, string[]>; outbound: Map<string, string[]> } {
  const nodeNames = new Set(nodes.map((n) => n.name));
  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();

  for (const name of nodeNames) {
    inbound.set(name, []);
    outbound.set(name, []);
  }

  for (const [sourceName, outputs] of Object.entries(connections)) {
    if (!nodeNames.has(sourceName)) {
      findings.push({
        severity: "ERROR",
        category: "CONNECTION",
        message: `Conexión desde nodo inexistente "${sourceName}".`,
        node: sourceName,
        fix: "Eliminar de connections o crear el nodo.",
      });
      continue;
    }

    for (const [_outputType, branches] of Object.entries(outputs)) {
      if (!Array.isArray(branches)) continue;

      for (let bi = 0; bi < branches.length; bi++) {
        const branch = branches[bi];
        if (!Array.isArray(branch)) continue;

        for (const target of branch) {
          if (!target || typeof target.node !== "string") {
            findings.push({
              severity: "ERROR",
              category: "CONNECTION",
              message: `Target malformado en branch ${bi}.`,
              node: sourceName,
              fix: '{ "node": "string", "type": "main", "index": number }',
            });
            continue;
          }

          if (!nodeNames.has(target.node)) {
            findings.push({
              severity: "ERROR",
              category: "CONNECTION",
              message: `Apunta a nodo inexistente: "${target.node}".`,
              node: sourceName,
              fix: `Crear "${target.node}" o corregir la conexión.`,
            });
            continue;
          }

          outbound.get(sourceName)?.push(target.node);
          inbound.get(target.node)?.push(sourceName);
        }
      }
    }
  }

  return { inbound, outbound };
}

function checkOrphans(
  nodes: N8NNode[],
  inbound: Map<string, string[]>,
  outbound: Map<string, string[]>,
  findings: Finding[],
): void {
  for (const node of nodes) {
    if (node.disabled) continue;

    const hasIn = (inbound.get(node.name)?.length ?? 0) > 0;
    const hasOut = (outbound.get(node.name)?.length ?? 0) > 0;
    const trigger = isTrigger(node.type);

    if (trigger && !hasOut) {
      findings.push({
        severity: "WARN",
        category: "ORPHAN",
        message: "Trigger sin salida — no dispara nada.",
        node: node.name,
        fix: "Conectar al primer nodo de procesamiento.",
      });
    }

    if (!trigger && !hasIn) {
      findings.push({
        severity: "WARN",
        category: "ORPHAN",
        message: "Nodo sin entrada — nunca se ejecutará.",
        node: node.name,
        fix: "Conectar desde un trigger/nodo previo, o eliminar.",
      });
    }

    if (!trigger && !hasIn && !hasOut) {
      findings.push({
        severity: "ERROR",
        category: "ORPHAN",
        message: "Nodo isla — sin entrada ni salida. Aislado.",
        node: node.name,
        fix: "Eliminar o conectar al flujo.",
      });
    }
  }
}

function checkCycles(
  nodes: N8NNode[],
  outbound: Map<string, string[]>,
  findings: Finding[],
): void {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.name, WHITE);

  const cycles: string[] = [];

  function dfs(name: string): void {
    color.set(name, GRAY);
    for (const neighbor of outbound.get(name) ?? []) {
      if (color.get(neighbor) === GRAY) {
        cycles.push(`${name} → ${neighbor}`);
      } else if (color.get(neighbor) === WHITE) {
        dfs(neighbor);
      }
    }
    color.set(name, BLACK);
  }

  for (const n of nodes) {
    if (color.get(n.name) === WHITE) dfs(n.name);
  }

  if (cycles.length > 0) {
    findings.push({
      severity: "WARN",
      category: "CYCLE",
      message: `Ciclo(s): ${cycles.join("; ")}. ¿Intencional (retry loop)?`,
      fix: "Si no es intencional, romper el ciclo.",
    });
  }
}

function checkTripleEntry(nodes: N8NNode[], findings: Finding[]): void {
  const activeTypes = new Set(
    nodes.filter((n) => !n.disabled).map((n) => n.type),
  );

  const hasManual = activeTypes.has("n8n-nodes-base.manualTrigger");
  const hasWebhook = activeTypes.has("n8n-nodes-base.webhook");
  const hasExecTrig = activeTypes.has("n8n-nodes-base.executeWorkflowTrigger");

  if (hasExecTrig && !hasManual && !hasWebhook) {
    findings.push({
      severity: "INFO",
      category: "TRIPLE_ENTRY",
      message:
        "Sub-workflow (solo Execute Workflow Trigger). Triple Entry opcional.",
    });
    return;
  }

  const missing: string[] = [];
  if (!hasManual) missing.push("Manual Trigger");
  if (!hasWebhook) missing.push("Webhook");
  if (!hasExecTrig) missing.push("Execute Workflow Trigger");

  if (missing.length > 0) {
    findings.push({
      severity: "WARN",
      category: "TRIPLE_ENTRY",
      message: `Faltan: ${missing.join(", ")}.`,
      fix: "Agregar triggers faltantes → primer nodo de lógica (OBLIGATORIO_01).",
    });
  } else {
    findings.push({
      severity: "INFO",
      category: "TRIPLE_ENTRY",
      message: "Triple Entry Pattern completo ✓",
    });
  }
}

function checkWebhookPaths(nodes: N8NNode[], findings: Finding[]): void {
  for (const node of nodes) {
    if (node.type !== "n8n-nodes-base.webhook") continue;
    const path = (node.parameters as Record<string, unknown>)?.path;
    if (typeof path === "string" && path.includes("webhook-test")) {
      findings.push({
        severity: "ERROR",
        category: "WEBHOOK",
        message: 'Ruta contiene "webhook-test" — PROHIBIDO_07.',
        node: node.name,
        fix: "Usar ruta de producción /webhook/.",
      });
    }
  }
}

function checkDisabledNodes(nodes: N8NNode[], findings: Finding[]): void {
  const disabled = nodes.filter((n) => n.disabled === true);
  if (disabled.length > 0) {
    findings.push({
      severity: "INFO",
      category: "DISABLED",
      message: `${disabled.length} nodo(s) deshabilitado(s): ${disabled.map((n) => n.name).join(", ")}.`,
      fix: "Revisar si son necesarios o eliminar.",
    });
  }
}

function checkCredentials(nodes: N8NNode[], findings: Finding[]): void {
  for (const node of nodes) {
    if (!node.credentials) continue;
    for (const [credType, credValue] of Object.entries(node.credentials)) {
      if (!credValue || typeof credValue !== "object") {
        findings.push({
          severity: "WARN",
          category: "CREDENTIALS",
          message: `Credencial "${credType}" malformada.`,
          node: node.name,
          fix: "Reconfigurar desde UI n8n → Settings → Credentials.",
        });
      }
    }
  }
}

function checkStandardContract(
  nodes: N8NNode[],
  outbound: Map<string, string[]>,
  findings: Finding[],
): void {
  const terminals = nodes.filter(
    (n) =>
      !n.disabled &&
      !isTrigger(n.type) &&
      (outbound.get(n.name)?.length ?? 0) === 0,
  );

  if (terminals.length === 0) return;

  for (const node of terminals) {
    if (node.type === "n8n-nodes-base.code") {
      const code = String(
        (node.parameters as Record<string, unknown>)?.jsCode ?? "",
      );
      if (!code.includes("success")) {
        findings.push({
          severity: "WARN",
          category: "CONTRACT",
          message:
            'Nodo terminal Code sin "success" — ¿falta Standard Contract?',
          node: node.name,
          fix: "Retornar { success, error_code, error_message, data, _meta } (OBLIGATORIO_02).",
        });
      }
    }
  }

  findings.push({
    severity: "INFO",
    category: "CONTRACT",
    message: `Nodo(s) terminal(es): ${terminals.map((n) => n.name).join(", ")}`,
    fix: "Verificar Standard Contract manualmente (OBLIGATORIO_02).",
  });
}

// ══════════════════════════════════════════════════════════════
//  REPORTE
// ══════════════════════════════════════════════════════════════

function printReport(
  fileName: string,
  wf: N8NWorkflow,
  findings: Finding[],
  sot: ResolvedSOT,
): void {
  const nodeCount = wf.nodes?.length ?? 0;
  const connCount = Object.keys(wf.connections ?? {}).length;

  const sourceColors: Record<string, string> = {
    live: C.green,
    cache: C.cyan,
    fallback: C.yellow,
  };
  const sourceIcon: Record<string, string> = {
    live: "🔴 LIVE",
    cache: "💾 CACHE",
    fallback: "📋 FALLBACK",
  };

  console.log("");
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(
    `${C.bold}  N8N WORKFLOW VALIDATOR v2 — Live Discovery${C.reset}`,
  );
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log("");
  console.log(`  ${C.gray}Archivo:${C.reset}      ${fileName}`);
  console.log(
    `  ${C.gray}Workflow:${C.reset}     ${wf.name ?? "(sin nombre)"}`,
  );
  console.log(`  ${C.gray}ID:${C.reset}           ${wf.id ?? "(no asignado)"}`);
  console.log(`  ${C.gray}Nodos:${C.reset}        ${nodeCount}`);
  console.log(`  ${C.gray}Conexiones:${C.reset}   ${connCount} fuentes`);
  console.log(
    `  ${C.gray}SOT:${C.reset}          ${sourceColors[sot.source]}${sourceIcon[sot.source]}${C.reset} ${C.gray}${sot.sourceDetail}${C.reset}`,
  );
  console.log("");

  const counts: Record<Severity, number> = {
    FATAL: 0,
    ERROR: 0,
    WARN: 0,
    INFO: 0,
  };
  for (const f of findings) counts[f.severity]++;

  const bar = (sev: Severity, count: number) => {
    const colors: Record<Severity, string> = {
      FATAL: C.red,
      ERROR: C.red,
      WARN: C.yellow,
      INFO: C.cyan,
    };
    const filled =
      count > 0
        ? `${colors[sev]}${C.bold}${sev}: ${count}${C.reset}`
        : `${C.gray}${sev}: 0${C.reset}`;
    return filled;
  };

  console.log(
    `  ${bar("FATAL", counts.FATAL)}  │  ${bar("ERROR", counts.ERROR)}  │  ${bar("WARN", counts.WARN)}  │  ${bar("INFO", counts.INFO)}`,
  );
  console.log("");

  const categories = [...new Set(findings.map((f) => f.category))];

  for (const cat of categories) {
    const catFindings = findings.filter((f) => f.category === cat);
    console.log(`  ${C.bold}${C.magenta}─── ${cat} ───${C.reset}`);

    for (const f of catFindings) {
      const nodeLabel = f.node ? ` ${C.gray}[${f.node}]${C.reset}` : "";
      console.log(`    ${ICONS[f.severity]}${nodeLabel} ${f.message}`);
      if (f.fix) {
        console.log(`           ${C.green}→ ${f.fix}${C.reset}`);
      }
    }
    console.log("");
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );

  if (counts.FATAL > 0) {
    console.log(
      `  ${C.red}${C.bold}✖ FATAL — Workflow inutilizable en n8n actual${C.reset}`,
    );
    process.exitCode = 2;
  } else if (counts.ERROR > 0) {
    console.log(
      `  ${C.red}${C.bold}✘ ERRORES — Corregir antes de subir${C.reset}`,
    );
    process.exitCode = 1;
  } else if (counts.WARN > 0) {
    console.log(
      `  ${C.yellow}${C.bold}⚠ ADVERTENCIAS — Funcional pero revisar${C.reset}`,
    );
    process.exitCode = 0;
  } else {
    console.log(`  ${C.green}${C.bold}✔ WORKFLOW VÁLIDO${C.reset}`);
    process.exitCode = 0;
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log("");
}

// ══════════════════════════════════════════════════════════════
//  DISCOVER-ONLY: Imprimir node types instalados
// ══════════════════════════════════════════════════════════════

function printDiscoveryReport(cache: NodeTypeCache): void {
  console.log(
    `\n${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(
    `${C.bold}  NODE TYPES INSTALADOS — ${cache.n8nBaseUrl}${C.reset}`,
  );
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(`  ${C.gray}Descubierto:${C.reset} ${cache.discoveredAt}`);
  console.log(`  ${C.gray}Total:${C.reset}       ${cache.totalTypes} tipos\n`);

  const groups: Record<string, Array<[string, DiscoveredNodeType]>> = {};

  for (const [name, info] of Object.entries(cache.nodeTypes)) {
    const prefix = name.split(".")[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push([name, info]);
  }

  for (const [prefix, entries] of Object.entries(groups)) {
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    console.log(
      `  ${C.bold}${C.magenta}─── ${prefix} (${entries.length}) ───${C.reset}`,
    );

    for (const [name, info] of entries) {
      const shortName = name.replace(`${prefix}.`, "");
      const versions = info.availableVersions.join(", ");
      const latest = info.latestVersion;

      console.log(
        `    ${C.cyan}${shortName.padEnd(35)}${C.reset} ` +
          `v${C.bold}${latest}${C.reset} ` +
          `${C.gray}[${versions}]${C.reset} ` +
          `${C.gray}${info.displayName}${C.reset}`,
      );
    }
    console.log("");
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}\n`,
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = {
    live: args.includes("--live"),
    refresh: args.includes("--refresh"),
    verbose: args.includes("--verbose"),
    discoverOnly: args.includes("--discover-only"),
    help: args.includes("--help") || args.includes("-h"),
  };

  const positionalArgs = args.filter(
    (a) => !a.startsWith("--") && !a.startsWith("-"),
  );

  if (flags.help) {
    console.log(`
  ${C.bold}N8N Workflow Validator v2 — Con Live Discovery${C.reset}

  ${C.bold}Uso:${C.reset}
    npx tsx scripts-ts/validate_workflow.ts <workflow.json>           ${C.gray}# Auto: cache → discovery → fallback${C.reset}
    npx tsx scripts-ts/validate_workflow.ts <workflow.json> --live    ${C.gray}# Siempre consulta la API${C.reset}
    npx tsx scripts-ts/validate_workflow.ts <workflow.json> --refresh ${C.gray}# Consulta API + actualiza cache${C.reset}
    npx tsx scripts-ts/validate_workflow.ts --discover-only           ${C.gray}# Lista todos los node types instalados${C.reset}
    npx tsx scripts-ts/validate_workflow.ts --discover-only --refresh ${C.gray}# Fuerza re-discovery${C.reset}

  ${C.bold}Flags:${C.reset}
    --live           Consulta n8n API en cada ejecución (no usa caché)
    --refresh        Fuerza re-descubrimiento y actualiza caché
    --discover-only  Solo descubre node types, no valida workflow
    --verbose        Detalles extra de discovery
    --help           Muestra esta ayuda

  ${C.bold}Resolución de SOT (Source of Truth):${C.reset}
    1. 🔴 LIVE     API de tu instancia n8n → versiones exactas instaladas
    2. 💾 CACHE    ${CACHE_FILENAME} (auto-generated, < 24h)
    3. 📋 FALLBACK SOT hardcodeado del system prompt v3.1

  ${C.bold}Auth (ambos enviados si disponibles):${C.reset}
    N8N_API_KEY       → X-N8N-Api-Key   (/api/v1/*)
    N8N_ACCESS_TOKEN  → Bearer token    (/rest/*)

  ${C.bold}Validaciones (14 checks):${C.reset}
    • Estructura JSON             • Campos requeridos por nodo
    • Nombres duplicados          • IDs duplicados
    • Tipos instalados (live!)    • Versiones disponibles (live!)
    • Conexiones rotas            • Nodos huérfanos / islas
    • Ciclos en el grafo          • Triple Entry Pattern
    • Standard Contract           • Webhook paths prohibidos
    • Nodos deshabilitados        • Credenciales malformadas

  ${C.bold}Requiere .env:${C.reset}
    N8N_API_URL=https://n8n.stax.ink
    N8N_API_KEY=tu-api-key
    N8N_ACCESS_TOKEN=tu-access-token

  ${C.bold}Exit codes:${C.reset}  0=OK  1=Errores  2=Fatal
`);
    return;
  }

  if (flags.discoverOnly) {
    const env = loadEnv();
    if (!env.apiUrl) {
      console.error(`${C.red}✖ N8N_API_URL no configurado${C.reset}`);
      process.exitCode = 1;
      return;
    }

    if (!flags.refresh) {
      const cached = loadCache();
      if (cached) {
        printDiscoveryReport(cached);
        return;
      }
    }

    const discovered = await discoverNodeTypes(env, flags.verbose);
    if (!discovered) {
      console.error(`${C.red}✖ No se pudieron descubrir node types${C.reset}`);
      process.exitCode = 1;
      return;
    }

    saveCache(discovered);
    printDiscoveryReport(discovered);
    return;
  }

  if (positionalArgs.length === 0) {
    console.error(
      `${C.red}✖ Especificar archivo: npx tsx scripts-ts/validate_workflow.ts <file.json>${C.reset}`,
    );
    console.error(
      `${C.gray}  Usa --help para ver todas las opciones${C.reset}`,
    );
    process.exitCode = 1;
    return;
  }

  const filePath = positionalArgs[0];
  if (!existsSync(filePath)) {
    console.error(`${C.red}✖ Archivo no encontrado: ${filePath}${C.reset}`);
    process.exitCode = 2;
    return;
  }

  let wf: N8NWorkflow;
  try {
    const raw = readFileSync(filePath, "utf-8");
    wf = JSON.parse(raw) as N8NWorkflow;
  } catch (err) {
    console.error(
      `${C.red}✖ JSON inválido: ${(err as Error).message}${C.reset}`,
    );
    process.exitCode = 2;
    return;
  }

  const sot = await resolveSOT(flags);

  const findings: Finding[] = [];
  const structureOK = checkStructure(wf, findings);

  if (structureOK && wf.nodes) {
    checkNodeFields(wf.nodes, findings);
    checkDuplicateNames(wf.nodes, findings);
    checkDuplicateIds(wf.nodes, findings);
    checkNodeTypesAndVersions(wf.nodes, sot, findings);
    checkDisabledNodes(wf.nodes, findings);
    checkCredentials(wf.nodes, findings);
    checkWebhookPaths(wf.nodes, findings);
    checkTripleEntry(wf.nodes, findings);

    if (wf.connections) {
      const { inbound, outbound } = checkConnections(
        wf.nodes,
        wf.connections,
        findings,
      );
      checkOrphans(wf.nodes, inbound, outbound, findings);
      checkCycles(wf.nodes, outbound, findings);
      checkStandardContract(wf.nodes, outbound, findings);
    }
  }

  const order: Record<Severity, number> = {
    FATAL: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
  };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  printReport(basename(filePath), wf, findings, sot);
}

main();
