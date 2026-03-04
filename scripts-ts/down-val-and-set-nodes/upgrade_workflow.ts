#!/usr/bin/env npx tsx
// ══════════════════════════════════════════════════════════════
// upgrade_workflow.ts v2 — Actualiza typeVersion + valida workflow
//
// v2 FIX:
//   • Matching resiliente: busca por full type, short name, y variantes
//   • SIEMPRE escribe el archivo con upgrades (errores de validación no bloquean)
//   • Separa claramente FASE 1 (upgrade) de FASE 2 (validación)
//
// Uso:
//   npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json>
//   npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --ssot ssot-nodes.json
//   npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --dry-run
//   npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --backup
//   npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --target current
//   npx tsx scripts-ts/.../upgrade_workflow.ts workflows/*.json
//
// ══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve, basename, dirname } from "path";
import { fileURLToPath } from "url";

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);

const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  magenta: "\x1b[35m",
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

interface SSOTNode {
  type: string;
  displayName: string;
  latestVersion: number;
  availableVersions: number[];
  group: string[];
}

interface SSOTFile {
  _meta: {
    generatedAt: string;
    n8nVersion: string;
    n8nUrl: string;
    method: string;
    container: string;
    totalNodes: number;
  };
  nodes: SSOTNode[];
}

type Severity = "FATAL" | "ERROR" | "WARN" | "INFO";

interface Finding {
  severity: Severity;
  category: string;
  message: string;
  node?: string;
  fix?: string;
}

interface UpgradeAction {
  nodeName: string;
  nodeType: string;
  from: number;
  to: number;
  reason:
    | "invalid"
    | "upgrade"
    | "skip_disabled"
    | "skip_unknown"
    | "already_latest";
  matchedVia?: string;
}

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

const DEFAULT_SSOT = "ssot-nodes.json";

// ═══════════════════════════════════════════════════════════════
//  SSOT LOADER — Con índice multi-match
// ═══════════════════════════════════════════════════════════════

interface SSOTIndex {
  // Mapa exacto: "n8n-nodes-base.if" → SSOTNode
  byFullType: Map<string, SSOTNode>;
  // Mapa short name: "if" → SSOTNode (fallback)
  byShortName: Map<string, SSOTNode>;
  // Para detectar formato del SSOT
  format: "full" | "short" | "mixed";
  meta: SSOTFile["_meta"];
}

function loadSSOT(filePath: string): SSOTIndex | null {
  const paths = [
    resolve(process.cwd(), filePath),
    resolve(__dirname_local, "..", filePath),
    resolve(__dirname_local, "..", "..", filePath),
    resolve(__dirname_local, filePath),
  ];

  let content = "";
  let foundPath = "";
  for (const p of paths) {
    if (existsSync(p)) {
      content = readFileSync(p, "utf-8");
      foundPath = p;
      break;
    }
  }

  if (!content) {
    console.error(`  ${C.red}✖ SSOT no encontrado: ${filePath}${C.reset}`);
    console.error(`  ${C.gray}  Buscado en:${C.reset}`);
    for (const p of paths) console.error(`  ${C.gray}    ${p}${C.reset}`);
    console.error(
      `  ${C.gray}  Generar con: npx tsx scripts-ts/.../discover_node_types.ts${C.reset}`,
    );
    return null;
  }

  let ssot: SSOTFile;
  try {
    ssot = JSON.parse(content) as SSOTFile;
  } catch (err) {
    console.error(
      `  ${C.red}✖ JSON inválido: ${(err as Error).message}${C.reset}`,
    );
    return null;
  }

  if (!ssot.nodes || !Array.isArray(ssot.nodes)) {
    console.error(`  ${C.red}✖ SSOT sin campo "nodes" válido${C.reset}`);
    return null;
  }

  // ── Construir índices ──
  const byFullType = new Map<string, SSOTNode>();
  const byShortName = new Map<string, SSOTNode>();

  let fullCount = 0;
  let shortCount = 0;

  for (const node of ssot.nodes) {
    const type = node.type;

    // Detectar si es full qualified o short name
    const hasDot = type.includes(".");
    const isFullQualified =
      type.startsWith("n8n-nodes-base.") ||
      type.startsWith("@n8n/") ||
      type.startsWith("n8n-nodes-");

    if (isFullQualified) {
      // Full: "n8n-nodes-base.if"
      byFullType.set(type, node);
      // Extraer short name para fallback
      const dotIdx = type.lastIndexOf(".");
      if (dotIdx > 0) {
        const shortName = type.substring(dotIdx + 1);
        byShortName.set(shortName, node);
      }
      fullCount++;
    } else if (hasDot) {
      // Podría ser un community node con formato "package.name"
      byFullType.set(type, node);
      const dotIdx = type.lastIndexOf(".");
      if (dotIdx > 0) {
        byShortName.set(type.substring(dotIdx + 1), node);
      }
      fullCount++;
    } else {
      // Short: "if", "code", "webhook"
      byShortName.set(type, node);
      // Construir posibles full qualified names
      byFullType.set("n8n-nodes-base." + type, node);
      shortCount++;
    }
  }

  const format: SSOTIndex["format"] =
    fullCount > 0 && shortCount > 0
      ? "mixed"
      : fullCount > 0
        ? "full"
        : "short";

  if (format === "short") {
    console.log(
      `  ${C.yellow}⚠ SSOT usa nombres cortos ("if" en vez de "n8n-nodes-base.if")${C.reset}`,
    );
    console.log(
      `  ${C.yellow}  Regenerar con discover_node_types.ts v3.2 para nombres completos${C.reset}`,
    );
    console.log(
      `  ${C.yellow}  Matching por nombre corto activado como fallback${C.reset}`,
    );
  }

  console.log(`  ${C.green}✔ SSOT cargado: ${foundPath}${C.reset}`);
  console.log(
    `  ${C.gray}  n8n v${ssot._meta.n8nVersion} │ ${ssot._meta.totalNodes} tipos │ formato: ${format} │ ${ssot._meta.generatedAt}${C.reset}`,
  );

  return { byFullType, byShortName, format, meta: ssot._meta };
}

// ── Buscar nodo en SSOT con fallback ──────────────────────────
function lookupNode(
  nodeType: string,
  index: SSOTIndex,
): { node: SSOTNode; matchedVia: string } | null {
  // 1. Exact full type match
  //    "n8n-nodes-base.if" → "n8n-nodes-base.if"
  const exact = index.byFullType.get(nodeType);
  if (exact) return { node: exact, matchedVia: "exact" };

  // 2. Short name extraction from workflow type
  //    "n8n-nodes-base.if" → extract "if" → lookup in byShortName
  const lastDot = nodeType.lastIndexOf(".");
  if (lastDot > 0) {
    const shortName = nodeType.substring(lastDot + 1);
    const byShort = index.byShortName.get(shortName);
    if (byShort) return { node: byShort, matchedVia: `short:"${shortName}"` };
  }

  // 3. For @n8n/ types, try alternative constructions
  //    "@n8n/n8n-nodes-langchain.agent" → "agent" in byShortName
  if (nodeType.startsWith("@n8n/")) {
    const afterSlash = nodeType.substring(5); // "n8n-nodes-langchain.agent"
    const dotIdx = afterSlash.lastIndexOf(".");
    if (dotIdx > 0) {
      const shortName = afterSlash.substring(dotIdx + 1);
      const byShort = index.byShortName.get(shortName);
      if (byShort)
        return { node: byShort, matchedVia: `langchain-short:"${shortName}"` };
    }
  }

  // 4. Case-insensitive search (último recurso)
  const lowerType = nodeType.toLowerCase();
  for (const [key, val] of index.byFullType) {
    if (key.toLowerCase() === lowerType)
      return { node: val, matchedVia: `case-insensitive:"${key}"` };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
//  UPGRADE: Actualizar typeVersions
// ═══════════════════════════════════════════════════════════════

function upgradeNodes(
  nodes: N8NNode[],
  index: SSOTIndex,
  target: "latest" | "current",
): UpgradeAction[] {
  const actions: UpgradeAction[] = [];

  for (const node of nodes) {
    if (node.disabled) {
      actions.push({
        nodeName: node.name,
        nodeType: node.type,
        from: node.typeVersion,
        to: node.typeVersion,
        reason: "skip_disabled",
      });
      continue;
    }

    const lookup = lookupNode(node.type, index);

    if (!lookup) {
      actions.push({
        nodeName: node.name,
        nodeType: node.type,
        from: node.typeVersion,
        to: node.typeVersion,
        reason: "skip_unknown",
      });
      continue;
    }

    const installed = lookup.node;
    const currentVersion = node.typeVersion;
    const isValid = installed.availableVersions.includes(currentVersion);
    const isLatest = currentVersion === installed.latestVersion;

    if (!isValid) {
      node.typeVersion = installed.latestVersion;
      actions.push({
        nodeName: node.name,
        nodeType: node.type,
        from: currentVersion,
        to: installed.latestVersion,
        reason: "invalid",
        matchedVia: lookup.matchedVia,
      });
    } else if (!isLatest && target === "latest") {
      node.typeVersion = installed.latestVersion;
      actions.push({
        nodeName: node.name,
        nodeType: node.type,
        from: currentVersion,
        to: installed.latestVersion,
        reason: "upgrade",
        matchedVia: lookup.matchedVia,
      });
    } else {
      actions.push({
        nodeName: node.name,
        nodeType: node.type,
        from: currentVersion,
        to: currentVersion,
        reason: "already_latest",
        matchedVia: lookup.matchedVia,
      });
    }
  }

  return actions;
}

// ═══════════════════════════════════════════════════════════════
//  VALIDACIONES (post-upgrade, NUNCA bloquean la escritura)
// ═══════════════════════════════════════════════════════════════

function checkStructure(wf: N8NWorkflow, findings: Finding[]): boolean {
  if (!wf.name || typeof wf.name !== "string" || wf.name.trim() === "") {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: "Workflow sin nombre.",
      fix: 'Agregar "name".',
    });
  }
  if (!Array.isArray(wf.nodes)) {
    findings.push({
      severity: "FATAL",
      category: "STRUCTURE",
      message: '"nodes" no es array.',
    });
    return false;
  }
  if (wf.nodes.length === 0) {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: "Sin nodos.",
    });
    return false;
  }
  if (!wf.connections || typeof wf.connections !== "object") {
    findings.push({
      severity: "ERROR",
      category: "STRUCTURE",
      message: '"connections" falta.',
      fix: 'Agregar "connections": {}.',
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
    for (const f of required) {
      if (node[f] === undefined || node[f] === null) {
        findings.push({
          severity: "ERROR",
          category: "NODE_FIELD",
          message: `"${f}" faltante.`,
          node: node.name || `[${idx}]`,
        });
      }
    }
    if (
      node.position &&
      (!Array.isArray(node.position) ||
        node.position.length !== 2 ||
        typeof node.position[0] !== "number" ||
        typeof node.position[1] !== "number")
    ) {
      findings.push({
        severity: "WARN",
        category: "NODE_FIELD",
        message: '"position" debe ser [x,y].',
        node: node.name,
      });
    }
  });
}

function checkDuplicateNames(nodes: N8NNode[], findings: Finding[]): void {
  const seen = new Map<string, number>();
  for (const n of nodes) {
    if (n.name) seen.set(n.name, (seen.get(n.name) || 0) + 1);
  }
  for (const [name, count] of seen) {
    if (count > 1)
      findings.push({
        severity: "ERROR",
        category: "DUPLICATE",
        message: `"${name}" ×${count}.`,
        node: name,
      });
  }
}

function checkDuplicateIds(nodes: N8NNode[], findings: Finding[]): void {
  const seen = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.id) {
      if (!seen.has(n.id)) seen.set(n.id, []);
      seen.get(n.id)!.push(n.name);
    }
  }
  for (const [id, names] of seen) {
    if (names.length > 1)
      findings.push({
        severity: "ERROR",
        category: "DUPLICATE",
        message: `ID "${id}" compartido: ${names.join(", ")}.`,
        node: names[0],
      });
  }
}

function checkVersionsPostUpgrade(
  nodes: N8NNode[],
  index: SSOTIndex,
  findings: Finding[],
): void {
  for (const node of nodes) {
    if (node.disabled) continue;
    const lookup = lookupNode(node.type, index);
    if (!lookup) continue;
    if (!lookup.node.availableVersions.includes(node.typeVersion)) {
      findings.push({
        severity: "ERROR",
        category: "VERSION",
        message: `v${node.typeVersion} no disponible. [${lookup.node.availableVersions.join(", ")}]`,
        node: node.name,
        fix: `Cambiar a v${lookup.node.latestVersion}.`,
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

  for (const [src, outputs] of Object.entries(connections)) {
    if (!nodeNames.has(src)) {
      findings.push({
        severity: "ERROR",
        category: "CONNECTION",
        message: `Conexión desde nodo inexistente "${src}".`,
        node: src,
        fix: "Eliminar de connections o renombrar el nodo para que coincida.",
      });
      continue;
    }
    for (const [, branches] of Object.entries(outputs)) {
      if (!Array.isArray(branches)) continue;
      for (let bi = 0; bi < branches.length; bi++) {
        if (!Array.isArray(branches[bi])) continue;
        for (const t of branches[bi]) {
          if (!t || typeof t.node !== "string") {
            findings.push({
              severity: "ERROR",
              category: "CONNECTION",
              message: `Target malformado en branch ${bi}.`,
              node: src,
            });
            continue;
          }
          if (!nodeNames.has(t.node)) {
            findings.push({
              severity: "ERROR",
              category: "CONNECTION",
              message: `Apunta a "${t.node}" (no existe).`,
              node: src,
            });
            continue;
          }
          outbound.get(src)?.push(t.node);
          inbound.get(t.node)?.push(src);
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
    if (trigger && !hasOut)
      findings.push({
        severity: "WARN",
        category: "ORPHAN",
        message: "Trigger sin salida.",
        node: node.name,
      });
    if (!trigger && !hasIn)
      findings.push({
        severity: "WARN",
        category: "ORPHAN",
        message: "Sin entrada.",
        node: node.name,
      });
    if (!trigger && !hasIn && !hasOut)
      findings.push({
        severity: "ERROR",
        category: "ORPHAN",
        message: "Nodo isla.",
        node: node.name,
        fix: "Eliminar o conectar.",
      });
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
    for (const nb of outbound.get(name) ?? []) {
      if (color.get(nb) === GRAY) cycles.push(`${name} → ${nb}`);
      else if (color.get(nb) === WHITE) dfs(nb);
    }
    color.set(name, BLACK);
  }
  for (const n of nodes) {
    if (color.get(n.name) === WHITE) dfs(n.name);
  }
  if (cycles.length > 0)
    findings.push({
      severity: "WARN",
      category: "CYCLE",
      message: `Ciclo(s): ${cycles.join("; ")}.`,
    });
}

function checkTripleEntry(nodes: N8NNode[], findings: Finding[]): void {
  const types = new Set(nodes.filter((n) => !n.disabled).map((n) => n.type));
  const has = {
    manual: types.has("n8n-nodes-base.manualTrigger"),
    webhook: types.has("n8n-nodes-base.webhook"),
    exec: types.has("n8n-nodes-base.executeWorkflowTrigger"),
  };
  if (has.exec && !has.manual && !has.webhook) {
    findings.push({
      severity: "INFO",
      category: "TRIPLE_ENTRY",
      message: "Sub-workflow. Triple Entry opcional.",
    });
    return;
  }
  const missing: string[] = [];
  if (!has.manual) missing.push("Manual Trigger");
  if (!has.webhook) missing.push("Webhook");
  if (!has.exec) missing.push("Execute Workflow Trigger");
  if (missing.length > 0)
    findings.push({
      severity: "WARN",
      category: "TRIPLE_ENTRY",
      message: `Faltan: ${missing.join(", ")}.`,
    });
  else
    findings.push({
      severity: "INFO",
      category: "TRIPLE_ENTRY",
      message: "Triple Entry completo ✓",
    });
}

function checkWebhookPaths(nodes: N8NNode[], findings: Finding[]): void {
  for (const n of nodes) {
    if (n.type !== "n8n-nodes-base.webhook") continue;
    const path = (n.parameters as Record<string, unknown>)?.path;
    if (typeof path === "string" && path.includes("webhook-test")) {
      findings.push({
        severity: "ERROR",
        category: "WEBHOOK",
        message: '"webhook-test" — PROHIBIDO_07.',
        node: n.name,
      });
    }
  }
}

function checkDisabledNodes(nodes: N8NNode[], findings: Finding[]): void {
  const disabled = nodes.filter((n) => n.disabled);
  if (disabled.length > 0)
    findings.push({
      severity: "INFO",
      category: "DISABLED",
      message: `${disabled.length} deshabilitado(s): ${disabled.map((n) => n.name).join(", ")}.`,
    });
}

function checkCredentials(nodes: N8NNode[], findings: Finding[]): void {
  for (const n of nodes) {
    if (!n.credentials) continue;
    for (const [type, val] of Object.entries(n.credentials)) {
      if (!val || typeof val !== "object")
        findings.push({
          severity: "WARN",
          category: "CREDENTIALS",
          message: `"${type}" malformada.`,
          node: n.name,
        });
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
  for (const n of terminals) {
    if (n.type === "n8n-nodes-base.code") {
      const code = String(
        (n.parameters as Record<string, unknown>)?.jsCode ?? "",
      );
      if (!code.includes("success"))
        findings.push({
          severity: "WARN",
          category: "CONTRACT",
          message: 'Terminal Code sin "success".',
          node: n.name,
        });
    }
  }
  if (terminals.length > 0)
    findings.push({
      severity: "INFO",
      category: "CONTRACT",
      message: `Terminal(es): ${terminals.map((n) => n.name).join(", ")}`,
    });
}

// ═══════════════════════════════════════════════════════════════
//  REPORTES
// ═══════════════════════════════════════════════════════════════

function printUpgradeReport(
  actions: UpgradeAction[],
  dryRun: boolean,
  verbose: boolean,
): void {
  const invalid = actions.filter((a) => a.reason === "invalid");
  const upgraded = actions.filter((a) => a.reason === "upgrade");
  const latest = actions.filter((a) => a.reason === "already_latest");
  const unknown = actions.filter((a) => a.reason === "skip_unknown");
  const disabled = actions.filter((a) => a.reason === "skip_disabled");
  const changed = invalid.length + upgraded.length;

  console.log(
    `\n  ${C.bold}${C.magenta}─── FASE 1: VERSION UPGRADES ${dryRun ? "(DRY RUN)" : ""} ───${C.reset}\n`,
  );

  if (invalid.length > 0) {
    for (const a of invalid) {
      const short = a.nodeType.substring(a.nodeType.lastIndexOf(".") + 1);
      const via =
        verbose && a.matchedVia
          ? ` ${C.gray}(via ${a.matchedVia})${C.reset}`
          : "";
      console.log(
        `  ${C.red}✖ FIX     ${C.reset} ${C.gray}[${a.nodeName}]${C.reset} ` +
          `${short} ${C.red}v${a.from}${C.reset} → ${C.green}v${a.to}${C.reset} ` +
          `${C.red}(versión inválida)${C.reset}${via}`,
      );
    }
  }

  if (upgraded.length > 0) {
    for (const a of upgraded) {
      const short = a.nodeType.substring(a.nodeType.lastIndexOf(".") + 1);
      const via =
        verbose && a.matchedVia
          ? ` ${C.gray}(via ${a.matchedVia})${C.reset}`
          : "";
      console.log(
        `  ${C.yellow}⬆ UPGRADE${C.reset} ${C.gray}[${a.nodeName}]${C.reset} ` +
          `${short} ${C.yellow}v${a.from}${C.reset} → ${C.green}v${a.to}${C.reset}${via}`,
      );
    }
  }

  if (latest.length > 0) {
    if (verbose) {
      for (const a of latest) {
        const short = a.nodeType.substring(a.nodeType.lastIndexOf(".") + 1);
        console.log(
          `  ${C.green}✔ OK     ${C.reset} ${C.gray}[${a.nodeName}]${C.reset} ` +
            `${short} v${a.from} ${C.gray}(via ${a.matchedVia})${C.reset}`,
        );
      }
    } else {
      console.log(
        `  ${C.green}✔ OK     ${C.reset} ${C.gray}${latest.length} nodo(s) ya en latest${C.reset}`,
      );
    }
  }

  if (unknown.length > 0) {
    const uniqueTypes = [...new Set(unknown.map((a) => a.nodeType))];
    console.log(
      `  ${C.yellow}? UNKNOWN${C.reset} ${C.gray}${unknown.length} nodo(s) no en SSOT:${C.reset}`,
    );
    for (const t of uniqueTypes) {
      console.log(`  ${C.gray}           ${t}${C.reset}`);
    }
  }

  if (disabled.length > 0) {
    console.log(
      `  ${C.gray}⊘ SKIP    ${disabled.length} nodo(s) deshabilitado(s)${C.reset}`,
    );
  }

  console.log("");
  console.log(
    `  ${C.bold}Resumen:${C.reset} ` +
      `${C.red}${invalid.length} fixed${C.reset} + ` +
      `${C.yellow}${upgraded.length} upgraded${C.reset} + ` +
      `${C.green}${latest.length} ok${C.reset} + ` +
      `${C.gray}${unknown.length} unknown${C.reset} + ` +
      `${C.gray}${disabled.length} disabled${C.reset} = ` +
      `${C.bold}${changed} cambios${C.reset}`,
  );
}

function printValidationReport(findings: Finding[]): void {
  const counts: Record<Severity, number> = {
    FATAL: 0,
    ERROR: 0,
    WARN: 0,
    INFO: 0,
  };
  for (const f of findings) counts[f.severity]++;

  console.log(
    `\n  ${C.bold}${C.magenta}─── FASE 2: VALIDACIÓN (informativa, NO bloquea) ───${C.reset}\n`,
  );

  const bar = (sev: Severity, n: number) => {
    const c: Record<Severity, string> = {
      FATAL: C.red,
      ERROR: C.red,
      WARN: C.yellow,
      INFO: C.cyan,
    };
    return n > 0
      ? `${c[sev]}${C.bold}${sev}: ${n}${C.reset}`
      : `${C.gray}${sev}: 0${C.reset}`;
  };

  console.log(
    `  ${bar("FATAL", counts.FATAL)}  │  ${bar("ERROR", counts.ERROR)}  │  ${bar("WARN", counts.WARN)}  │  ${bar("INFO", counts.INFO)}\n`,
  );

  const categories = [...new Set(findings.map((f) => f.category))];
  for (const cat of categories) {
    const cf = findings.filter((f) => f.category === cat);
    console.log(`  ${C.bold}${C.magenta}─── ${cat} ───${C.reset}`);
    for (const f of cf) {
      const nl = f.node ? ` ${C.gray}[${f.node}]${C.reset}` : "";
      console.log(`    ${ICONS[f.severity]}${nl} ${f.message}`);
      if (f.fix) console.log(`           ${C.green}→ ${f.fix}${C.reset}`);
    }
    console.log("");
  }
}

// ═══════════════════════════════════════════════════════════════
//  PROCESAR UN WORKFLOW
// ═══════════════════════════════════════════════════════════════

function processWorkflow(
  filePath: string,
  index: SSOTIndex,
  flags: {
    dryRun: boolean;
    backup: boolean;
    target: "latest" | "current";
    verbose: boolean;
  },
): { changed: number; errors: number } {
  const fileName = basename(filePath);

  let wf: N8NWorkflow;
  try {
    const raw = readFileSync(filePath, "utf-8");
    wf = JSON.parse(raw) as N8NWorkflow;
  } catch (err) {
    console.error(
      `  ${C.red}✖ ${fileName}: ${(err as Error).message}${C.reset}`,
    );
    return { changed: 0, errors: 1 };
  }

  console.log(
    `\n${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(`${C.bold}  UPGRADE: ${wf.name || fileName}${C.reset}`);
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(`  ${C.gray}Archivo:${C.reset}  ${filePath}`);
  console.log(`  ${C.gray}ID:${C.reset}       ${wf.id || "(sin ID)"}`);
  console.log(`  ${C.gray}Nodos:${C.reset}    ${wf.nodes?.length || 0}`);
  console.log(`  ${C.gray}Target:${C.reset}   ${flags.target}`);
  console.log(
    `  ${C.gray}Modo:${C.reset}     ${flags.dryRun ? "DRY RUN" : flags.backup ? "WRITE + BACKUP" : "WRITE"}`,
  );

  if (!wf.nodes || !Array.isArray(wf.nodes) || wf.nodes.length === 0) {
    console.error(`  ${C.red}✖ Workflow sin nodos válidos${C.reset}`);
    return { changed: 0, errors: 1 };
  }

  // ══ FASE 1: UPGRADE (siempre se ejecuta) ══
  const actions = upgradeNodes(wf.nodes, index, flags.target);
  const changedCount = actions.filter(
    (a) => a.reason === "invalid" || a.reason === "upgrade",
  ).length;

  printUpgradeReport(actions, flags.dryRun, flags.verbose);

  // ══ FASE 2: VALIDACIÓN (informativa, NUNCA bloquea) ══
  const findings: Finding[] = [];
  const structureOK = checkStructure(wf, findings);

  if (structureOK && wf.nodes) {
    checkNodeFields(wf.nodes, findings);
    checkDuplicateNames(wf.nodes, findings);
    checkDuplicateIds(wf.nodes, findings);
    checkVersionsPostUpgrade(wf.nodes, index, findings);
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

  printValidationReport(findings);

  const errorCount = findings.filter(
    (f) => f.severity === "FATAL" || f.severity === "ERROR",
  ).length;

  // ══ FASE 3: ESCRIBIR (SIEMPRE, independiente de errores de validación) ══
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );

  if (flags.dryRun) {
    console.log(
      `  ${C.cyan}${C.bold}ℹ DRY RUN: ${changedCount} cambio(s) detectado(s), archivo NO modificado${C.reset}`,
    );
  } else {
    // Backup siempre antes de escribir
    if (flags.backup) {
      const bakPath = filePath + ".bak";
      copyFileSync(filePath, bakPath);
      console.log(`  ${C.gray}Backup: ${bakPath}${C.reset}`);
    }

    // SIEMPRE escribir — los errores de validación son informativos
    const output = JSON.stringify(wf, null, 2) + "\n";
    writeFileSync(filePath, output, "utf-8");

    if (changedCount > 0) {
      console.log(
        `  ${C.green}${C.bold}✔ ${changedCount} nodo(s) actualizado(s) → ${filePath}${C.reset}`,
      );
    } else {
      console.log(
        `  ${C.green}${C.bold}✔ Archivo reescrito (sin cambios de versión)${C.reset}`,
      );
    }
  }

  if (errorCount > 0) {
    console.log(
      `  ${C.yellow}⚠ ${errorCount} problema(s) de validación (informativos, no bloquean)${C.reset}`,
    );
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );

  return { changed: changedCount, errors: errorCount };
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

function main(): void {
  const args = process.argv.slice(2);

  const getArgValue = (flag: string): string | undefined =>
    args.find((_, i) => args[i - 1] === flag);

  const flags = {
    ssot: getArgValue("--ssot") || DEFAULT_SSOT,
    dryRun: args.includes("--dry-run"),
    backup: args.includes("--backup"),
    target: (getArgValue("--target") || "latest") as "latest" | "current",
    verbose: args.includes("--verbose"),
    help: args.includes("--help") || args.includes("-h"),
  };

  const flagNames = ["--ssot", "--target"];
  const workflowFiles = args.filter(
    (a) =>
      !a.startsWith("--") &&
      !flagNames.some((f) => args[args.indexOf(a) - 1] === f),
  );

  if (flags.help || workflowFiles.length === 0) {
    console.log(`
  ${C.bold}N8N Workflow Upgrader v2 — Resilient Matching${C.reset}

  ${C.bold}Uso:${C.reset}
    npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json>                    ${C.gray}# upgrade + validar${C.reset}
    npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --dry-run          ${C.gray}# solo mostrar${C.reset}
    npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --backup           ${C.gray}# crear .bak${C.reset}
    npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --ssot custom.json ${C.gray}# SSOT custom${C.reset}
    npx tsx scripts-ts/.../upgrade_workflow.ts <workflow.json> --target current   ${C.gray}# solo fix inválidos${C.reset}
    npx tsx scripts-ts/.../upgrade_workflow.ts workflows/*.json --backup          ${C.gray}# batch${C.reset}

  ${C.bold}Matching SSOT (resiliente):${C.reset}
    1. Exacto:     "n8n-nodes-base.if" → "n8n-nodes-base.if"
    2. Short name: "n8n-nodes-base.if" → busca "if" en SSOT
    3. Langchain:  "@n8n/n8n-nodes-langchain.agent" → busca "agent"
    4. Case-insensitive (último recurso)

  ${C.bold}Fases:${C.reset}
    FASE 1: Upgrade versiones (SIEMPRE se ejecuta)
    FASE 2: Validación (informativa, NUNCA bloquea la escritura)
    FASE 3: Escribir archivo (SIEMPRE escribe si no es --dry-run)

  ${C.bold}Exit codes:${C.reset}  0=OK  1=Warnings de validación  2=Fatal (SSOT no encontrado)
`);
    return;
  }

  console.log(`\n  ${C.bold}🔧 N8N Workflow Upgrader v2${C.reset}`);

  const index = loadSSOT(flags.ssot);
  if (!index) {
    process.exitCode = 2;
    return;
  }

  let totalChanged = 0;
  let totalErrors = 0;
  let totalFiles = 0;

  for (const file of workflowFiles) {
    if (!existsSync(file)) {
      console.error(`  ${C.red}✖ No encontrado: ${file}${C.reset}`);
      totalErrors++;
      continue;
    }
    const { changed, errors } = processWorkflow(file, index, flags);
    totalChanged += changed;
    totalErrors += errors;
    totalFiles++;
  }

  if (workflowFiles.length > 1) {
    console.log(
      `\n${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(`${C.bold}  RESUMEN BATCH${C.reset}`);
    console.log(
      `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
    );
    console.log(`  ${C.gray}Archivos:${C.reset}  ${totalFiles}`);
    console.log(`  ${C.green}Cambios:${C.reset}   ${totalChanged}`);
    console.log(`  ${C.yellow}Avisos:${C.reset}    ${totalErrors}`);
    console.log(
      `  ${C.gray}Modo:${C.reset}      ${flags.dryRun ? "DRY RUN" : "WRITE"}`,
    );
    console.log(
      `${C.bold}══════════════════════════════════════════════════════════════${C.reset}\n`,
    );
  }
}

main();
