#!/usr/bin/env npx tsx
// ══════════════════════════════════════════════════════════════
// discover_node_types.ts v3.2 — N8N Node Types Discovery
//
// FIX v3.2: Construye el full qualified type name (package.name)
//           para que coincida con workflow JSON.
//
// Soporta ambos patrones de nodos:
//   • VersionedNodeType → inst.nodeVersions (IF, Switch, Code, etc.)
//   • Regular NodeType  → description.version
//
// Método: docker cp + exec (sin escaping inline)
//
// Uso:
//   npx tsx scripts-ts/discover_node_types.ts
//   npx tsx scripts-ts/discover_node_types.ts --method docker --verbose
//   npx tsx scripts-ts/discover_node_types.ts --diff workflows/BB_01.json
//   npx tsx scripts-ts/discover_node_types.ts --container n8n_titanium
//   npx tsx scripts-ts/discover_node_types.ts --file ssot-nodes.json
//
// Output:
//   .n8n-node-types-cache.json  (cache interno para validate_workflow.ts)
//   ssot-nodes.json             (SSOT limpio, --file configurable)
//
// ══════════════════════════════════════════════════════════════

import { execSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdtempSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

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
  n8nVersion: string;
  method: string;
  containerName: string;
  totalTypes: number;
  nodeTypes: Record<string, DiscoveredNodeType>;
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

interface EnvConfig {
  apiUrl: string;
  apiKey: string;
  accessToken: string;
}

const CACHE_FILENAME = ".n8n-node-types-cache.json";
const DEFAULT_SSOT_FILENAME = "ssot-nodes.json";
const DEFAULT_CONTAINER = "n8n_titanium";

// ═══════════════════════════════════════════════════════════════
//  .ENV LOADER
// ═══════════════════════════════════════════════════════════════

function loadEnv(): EnvConfig {
  const envPaths = [
    resolve(__dirname_local, "..", ".env"),
    resolve(__dirname_local, "..", "..", ".env"),
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

// ═══════════════════════════════════════════════════════════════
//  DOCKER HELPERS
// ═══════════════════════════════════════════════════════════════

function detectContainer(preferred: string, verbose: boolean): string | null {
  try {
    const result = execSync(
      `docker inspect --format='{{.State.Status}}' ${preferred} 2>/dev/null`,
      { encoding: "utf-8", timeout: 5000 },
    )
      .trim()
      .replace(/'/g, "");
    if (result === "running") {
      if (verbose)
        console.log(`  ${C.green}✔ Container "${preferred}" running${C.reset}`);
      return preferred;
    }
  } catch {
    /* */
  }

  try {
    const all = execSync(`docker ps --format='{{.Names}}' 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 5000,
    })
      .trim()
      .split("\n")
      .filter((n) => n.toLowerCase().includes("n8n"));
    if (all.length > 0) {
      if (verbose)
        console.log(`  ${C.cyan}ℹ Auto-detectado: "${all[0]}"${C.reset}`);
      return all[0];
    }
  } catch {
    /* */
  }

  return null;
}

function getN8NVersion(container: string): string {
  const cmds = [
    `docker exec ${container} node -e "process.stdout.write(require('/usr/local/lib/node_modules/n8n/package.json').version)"`,
    `docker exec ${container} n8n --version`,
  ];
  for (const cmd of cmds) {
    try {
      const result = execSync(cmd, {
        encoding: "utf-8",
        timeout: 10000,
      }).trim();
      const match = result.match(/(\d+\.\d+\.\d+)/);
      if (match) return match[1];
    } catch {
      continue;
    }
  }
  return "unknown";
}

// ═══════════════════════════════════════════════════════════════
//  INNER SCRIPT — Corre DENTRO del container via docker cp
//
//  v3.2 FIX: Construye full qualified type name:
//    • n8n-nodes-base.if       (no solo "if")
//    • @n8n/n8n-nodes-langchain.agent  (no solo "agent")
//
//  Esto coincide con el campo "type" en workflow JSON.
// ═══════════════════════════════════════════════════════════════

const INNER_SCRIPT = `'use strict';

var fs = require('fs');
var path = require('path');

var results = [];
var errors = [];
var scannedPaths = [];
var stats = { versioned: 0, regular: 0, failed: 0 };

// Cada scan path tiene su package prefix asociado
var SCAN_CONFIGS = [
  {
    path: '/usr/local/lib/node_modules/n8n/node_modules/n8n-nodes-base/dist/nodes',
    prefix: 'n8n-nodes-base'
  },
  {
    path: '/usr/local/lib/node_modules/n8n/node_modules/@n8n/n8n-nodes-langchain/dist/nodes',
    prefix: '@n8n/n8n-nodes-langchain'
  },
  {
    path: '/home/node/.n8n/nodes',
    prefix: '__community__'
  },
  {
    path: '/root/.n8n/nodes',
    prefix: '__community__'
  }
];

function walk(dir) {
  var files = [];
  try {
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var full = path.join(dir, entries[i].name);
      if (entries[i].isDirectory()) {
        var sub = walk(full);
        for (var j = 0; j < sub.length; j++) files.push(sub[j]);
      } else {
        files.push(full);
      }
    }
  } catch (e) {}
  return files;
}

// Detectar package prefix para community nodes desde el path del archivo
function detectCommunityPrefix(filePath) {
  // Path: .../node_modules/n8n-nodes-<name>/dist/...
  var match = filePath.match(/node_modules\\/(n8n-nodes-[^\\/]+)/);
  if (match) return match[1];
  // Path: .../node_modules/@<scope>/<name>/dist/...
  var scopeMatch = filePath.match(/node_modules\\/(@[^\\/]+\\/[^\\/]+)/);
  if (scopeMatch) return scopeMatch[1];
  return 'unknown-package';
}

for (var si = 0; si < SCAN_CONFIGS.length; si++) {
  var config = SCAN_CONFIGS[si];
  var scanPath = config.path;
  var packagePrefix = config.prefix;

  try {
    fs.accessSync(scanPath);
    scannedPaths.push(scanPath);
  } catch (e) {
    continue;
  }

  var nodeFiles = walk(scanPath).filter(function(f) {
    return f.endsWith('.node.js');
  });

  for (var fi = 0; fi < nodeFiles.length; fi++) {
    var file = nodeFiles[fi];

    try {
      var mod = require(file);
    } catch (reqErr) {
      errors.push({ file: file, error: 'require: ' + String(reqErr.message).substring(0, 120) });
      stats.failed++;
      continue;
    }

    var exportedValues = Object.values(mod);

    for (var ei = 0; ei < exportedValues.length; ei++) {
      var cls = exportedValues[ei];
      if (typeof cls !== 'function') continue;

      var inst;
      try {
        inst = new cls();
      } catch (instErr) {
        continue;
      }

      if (!inst.description) continue;

      var d = inst.description;
      var shortName = d.name;
      if (!shortName) continue;

      // ══════════════════════════════════════════════════════
      //  v3.2 FIX: Construir full qualified type name
      //  Esto es lo que n8n usa en workflow JSON como "type"
      // ══════════════════════════════════════════════════════
      var resolvedPrefix = packagePrefix;
      if (packagePrefix === '__community__') {
        resolvedPrefix = detectCommunityPrefix(file);
      }
      var fullType = resolvedPrefix + '.' + shortName;

      // ══════════════════════════════════════════════════════
      //  DETECTAR VERSIONES — Ambos patrones
      // ══════════════════════════════════════════════════════

      var versions = [];
      var defaultVer = 1;
      var nodePattern = 'unknown';

      if (inst.nodeVersions && typeof inst.nodeVersions === 'object') {
        nodePattern = 'versioned';
        var vKeys = Object.keys(inst.nodeVersions);
        for (var vi = 0; vi < vKeys.length; vi++) {
          var v = Number(vKeys[vi]);
          if (!isNaN(v) && v > 0) versions.push(v);
        }
        if (typeof inst.currentVersion === 'number') {
          defaultVer = inst.currentVersion;
        }
        if (typeof d.defaultVersion === 'number') {
          defaultVer = d.defaultVersion;
        }
        stats.versioned++;
      } else {
        nodePattern = 'regular';
        if (Array.isArray(d.version)) {
          for (var vi2 = 0; vi2 < d.version.length; vi2++) {
            var v2 = Number(d.version[vi2]);
            if (!isNaN(v2) && v2 > 0) versions.push(v2);
          }
        } else if (typeof d.version === 'number') {
          versions.push(d.version);
        }
        if (typeof d.defaultVersion === 'number') {
          defaultVer = d.defaultVersion;
        } else if (versions.length > 0) {
          defaultVer = versions[versions.length - 1];
        }
        stats.regular++;
      }

      if (versions.length === 0) {
        versions.push(defaultVer);
      }
      if (versions.indexOf(defaultVer) === -1) {
        versions.push(defaultVer);
      }
      versions.sort(function(a, b) { return a - b; });

      var group = Array.isArray(d.group) ? d.group : [];
      var displayName = d.displayName || shortName;
      var desc = '';
      if (typeof d.description === 'string') {
        desc = d.description.substring(0, 200);
      }

      results.push({
        name: fullType,
        shortName: shortName,
        displayName: displayName,
        availableVersions: versions,
        latestVersion: defaultVer,
        group: group,
        description: desc,
        source: resolvedPrefix,
        pattern: nodePattern
      });
    }
  }
}

// Deduplicar por fullType
var deduped = {};
for (var ri = 0; ri < results.length; ri++) {
  var r = results[ri];
  if (!deduped[r.name]) {
    deduped[r.name] = r;
  } else {
    var existing = deduped[r.name];
    var mergedSet = {};
    var eav = existing.availableVersions;
    for (var mi = 0; mi < eav.length; mi++) mergedSet[eav[mi]] = true;
    var rav = r.availableVersions;
    for (var mk = 0; mk < rav.length; mk++) mergedSet[rav[mk]] = true;
    existing.availableVersions = Object.keys(mergedSet).map(Number).sort(function(a,b){return a-b;});
    existing.latestVersion = Math.max(existing.latestVersion, r.latestVersion);
    if (r.pattern === 'versioned') existing.pattern = 'versioned';
  }
}

var output = {
  nodes: Object.values(deduped),
  errors: errors,
  scannedPaths: scannedPaths,
  totalNodes: Object.keys(deduped).length,
  stats: stats
};

process.stdout.write(JSON.stringify(output));
`;

// ═══════════════════════════════════════════════════════════════
//  MÉTODO 1: DOCKER CP + EXEC
// ═══════════════════════════════════════════════════════════════

function discoverViaDocker(
  container: string,
  verbose: boolean,
): Record<string, DiscoveredNodeType> | null {
  const tmpDir = mkdtempSync(join(tmpdir(), "n8n-discover-"));
  const localScript = join(tmpDir, "discover_inner.js");
  const remoteScript = "/tmp/_discover_node_types.js";

  try {
    writeFileSync(localScript, INNER_SCRIPT, "utf-8");
    if (verbose)
      console.log(
        `  ${C.gray}→ Script: ${localScript} (${INNER_SCRIPT.length} bytes)${C.reset}`,
      );

    execSync(`docker cp "${localScript}" "${container}:${remoteScript}"`, {
      timeout: 10000,
    });
    if (verbose)
      console.log(
        `  ${C.gray}→ docker cp → ${container}:${remoteScript}${C.reset}`,
      );

    if (verbose)
      console.log(
        `  ${C.gray}→ docker exec ${container} node ${remoteScript}${C.reset}`,
      );

    const raw = execSync(`docker exec ${container} node ${remoteScript}`, {
      encoding: "utf-8",
      timeout: 60000,
      maxBuffer: 20 * 1024 * 1024,
    });

    try {
      execSync(`docker exec ${container} rm -f ${remoteScript}`, {
        timeout: 5000,
      });
    } catch {
      /* */
    }

    let jsonStr = "";
    const idx = raw.lastIndexOf('{"nodes":');
    if (idx !== -1) {
      jsonStr = raw.substring(idx);
    } else {
      jsonStr = raw.trim();
    }

    if (!jsonStr) {
      if (verbose) console.log(`  ${C.yellow}⚠ Sin salida JSON${C.reset}`);
      return null;
    }

    let parsed: {
      nodes: Array<{
        name: string;
        shortName: string;
        displayName: string;
        availableVersions: number[];
        latestVersion: number;
        group: string[];
        description: string;
        source: string;
        pattern: string;
      }>;
      errors: Array<{ file: string; error: string }>;
      scannedPaths: string[];
      totalNodes: number;
      stats: { versioned: number; regular: number; failed: number };
    };

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      if (verbose) {
        console.log(`  ${C.red}✖ JSON parse error${C.reset}`);
        console.log(
          `  ${C.gray}  Output (500 chars): ${raw.substring(0, 500)}${C.reset}`,
        );
      } else {
        console.log(
          `  ${C.red}✖ Error parseando respuesta — ejecutar con --verbose${C.reset}`,
        );
      }
      return null;
    }

    console.log(`  ${C.gray}Paths escaneados:${C.reset}`);
    for (const p of parsed.scannedPaths) {
      console.log(`    ${C.gray}✔ ${p}${C.reset}`);
    }
    console.log(
      `  ${C.gray}Nodos: ${parsed.totalNodes} total ` +
        `(${parsed.stats.versioned} versioned, ${parsed.stats.regular} regular, ` +
        `${parsed.stats.failed} failed)${C.reset}`,
    );

    if (verbose && parsed.errors.length > 0) {
      console.log(
        `  ${C.yellow}Errores de carga (${parsed.errors.length}):${C.reset}`,
      );
      for (const err of parsed.errors.slice(0, 8)) {
        const short = err.file.split("/").slice(-3).join("/");
        console.log(`    ${C.gray}${short}: ${err.error}${C.reset}`);
      }
      if (parsed.errors.length > 8) {
        console.log(
          `    ${C.gray}... y ${parsed.errors.length - 8} más${C.reset}`,
        );
      }
    }

    if (parsed.nodes.length === 0) return null;

    // Verificar que los nombres tienen el formato correcto
    let sampleTypes = parsed.nodes.slice(0, 3).map((n) => n.name);
    if (verbose) {
      console.log(
        `  ${C.gray}Muestra de tipos: ${sampleTypes.join(", ")}${C.reset}`,
      );
    }

    const nodeTypes: Record<string, DiscoveredNodeType> = {};
    for (const node of parsed.nodes) {
      nodeTypes[node.name] = {
        displayName: node.displayName,
        availableVersions: node.availableVersions,
        latestVersion: node.latestVersion,
        group: node.group,
        description: node.description,
      };
    }

    return nodeTypes;
  } catch (err) {
    const msg = (err as Error).message || "";
    if (msg.includes("No such container")) {
      console.log(`  ${C.red}✖ Container "${container}" no existe${C.reset}`);
    } else if (msg.includes("is not running")) {
      console.log(
        `  ${C.red}✖ Container "${container}" no está running${C.reset}`,
      );
    } else if (verbose) {
      console.log(
        `  ${C.red}✖ Docker falló: ${msg.substring(0, 300)}${C.reset}`,
      );
    } else {
      console.log(
        `  ${C.red}✖ Docker exec falló — ejecutar con --verbose${C.reset}`,
      );
    }
    return null;
  } finally {
    try {
      unlinkSync(localScript);
    } catch {
      /* */
    }
    try {
      execSync(`rmdir "${tmpDir}" 2>/dev/null`);
    } catch {
      /* */
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÉTODO 2: API REST
// ═══════════════════════════════════════════════════════════════

async function discoverViaAPI(
  env: EnvConfig,
  verbose: boolean,
): Promise<Record<string, DiscoveredNodeType> | null> {
  const baseUrl = env.apiUrl
    .replace(/\/api\/v\d+\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");
  if (!baseUrl) return null;

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (env.accessToken) headers["authorization"] = `Bearer ${env.accessToken}`;
  if (env.apiKey) headers["x-n8n-api-key"] = env.apiKey;

  const endpoints = [
    { url: `${baseUrl}/rest/node-types`, method: "POST" as const, body: {} },
    { url: `${baseUrl}/rest/node-types`, method: "GET" as const },
    { url: `${baseUrl}/types/nodes.json`, method: "GET" as const },
  ];

  for (const ep of endpoints) {
    try {
      if (verbose) console.log(`  ${C.gray}→ ${ep.method} ${ep.url}${C.reset}`);

      const opts: RequestInit = {
        method: ep.method,
        headers,
        signal: AbortSignal.timeout(15000),
      };
      if (ep.body && ep.method === "POST") opts.body = JSON.stringify(ep.body);

      const resp = await fetch(ep.url, opts);
      if (verbose) console.log(`  ${C.gray}  ← HTTP ${resp.status}${C.reset}`);
      if (!resp.ok) continue;

      const json = (await resp.json()) as unknown;
      let rawArray: unknown[] = [];

      if (Array.isArray(json)) rawArray = json;
      else if (
        json &&
        typeof json === "object" &&
        "data" in json &&
        Array.isArray((json as Record<string, unknown>).data)
      ) {
        rawArray = (json as Record<string, unknown>).data as unknown[];
      }
      if (rawArray.length === 0) continue;

      const nodeTypes: Record<string, DiscoveredNodeType> = {};
      for (const raw of rawArray) {
        if (!raw || typeof raw !== "object") continue;
        const entry = raw as Record<string, unknown>;
        const name = entry.name as string | undefined;
        if (!name) continue;

        let versions: number[] = [];
        if (Array.isArray(entry.version)) {
          versions = (entry.version as unknown[])
            .filter((v): v is number => typeof v === "number")
            .sort((a, b) => a - b);
        } else if (typeof entry.version === "number") {
          versions = [entry.version];
        }
        if (versions.length === 0) continue;

        nodeTypes[name] = {
          displayName: (entry.displayName as string) || name,
          availableVersions: versions,
          latestVersion: versions[versions.length - 1],
          group: Array.isArray(entry.group) ? (entry.group as string[]) : [],
          description: (entry.description as string) || undefined,
        };
      }

      if (Object.keys(nodeTypes).length > 0) return nodeTypes;
    } catch (err) {
      if (verbose)
        console.log(`  ${C.gray}  ← ${(err as Error).message}${C.reset}`);
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
//  SAVE
// ═══════════════════════════════════════════════════════════════

function getCachePath(): string {
  return resolve(__dirname_local, "..", "..", CACHE_FILENAME);
}

function saveCache(cache: NodeTypeCache): void {
  const p = getCachePath();
  writeFileSync(p, JSON.stringify(cache, null, 2), "utf-8");
  console.log(`  ${C.green}✔ Cache interno: ${p}${C.reset}`);
}

function saveSSOT(cache: NodeTypeCache, filePath: string): void {
  const nodes: SSOTNode[] = Object.entries(cache.nodeTypes)
    .map(([type, info]) => ({
      type,
      displayName: info.displayName,
      latestVersion: info.latestVersion,
      availableVersions: info.availableVersions,
      group: info.group,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));

  const ssot: SSOTFile = {
    _meta: {
      generatedAt: cache.discoveredAt,
      n8nVersion: cache.n8nVersion,
      n8nUrl: cache.n8nBaseUrl,
      method: cache.method,
      container: cache.containerName,
      totalNodes: nodes.length,
    },
    nodes,
  };

  const resolvedPath = resolve(process.cwd(), filePath);
  writeFileSync(resolvedPath, JSON.stringify(ssot, null, 2), "utf-8");
  console.log(`  ${C.green}✔ SSOT file:    ${resolvedPath}${C.reset}`);
}

// ═══════════════════════════════════════════════════════════════
//  REPORTE
// ═══════════════════════════════════════════════════════════════

function printReport(cache: NodeTypeCache): void {
  console.log(
    `\n${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(`${C.bold}  NODE TYPES — n8n v${cache.n8nVersion}${C.reset}`);
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(`  ${C.gray}Método:${C.reset}       ${cache.method}`);
  console.log(`  ${C.gray}Container:${C.reset}    ${cache.containerName}`);
  console.log(`  ${C.gray}URL:${C.reset}          ${cache.n8nBaseUrl}`);
  console.log(`  ${C.gray}Descubierto:${C.reset}  ${cache.discoveredAt}`);
  console.log(`  ${C.gray}Total:${C.reset}        ${cache.totalTypes} tipos\n`);

  const groups: Record<string, Array<[string, DiscoveredNodeType]>> = {};
  for (const [name, info] of Object.entries(cache.nodeTypes)) {
    // Agrupar por package prefix
    let prefix: string;
    if (name.startsWith("@n8n/")) {
      // @n8n/n8n-nodes-langchain.agent → @n8n/n8n-nodes-langchain
      const dotIdx = name.lastIndexOf(".");
      prefix = dotIdx > 0 ? name.substring(0, dotIdx) : name;
    } else {
      // n8n-nodes-base.if → n8n-nodes-base
      const dotIdx = name.indexOf(".");
      prefix = dotIdx > 0 ? name.substring(0, dotIdx) : name;
    }
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push([name, info]);
  }

  let multiVersion = 0;
  let singleVersion = 0;

  for (const [prefix, entries] of Object.entries(groups).sort()) {
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    console.log(
      `  ${C.bold}${C.magenta}─── ${prefix} (${entries.length}) ───${C.reset}`,
    );

    for (const [name, info] of entries) {
      // Show short name after last dot
      const dotIdx = name.lastIndexOf(".");
      const shortName = dotIdx > 0 ? name.substring(dotIdx + 1) : name;
      const versions = info.availableVersions.join(", ");
      const isMulti = info.availableVersions.length > 1;
      if (isMulti) multiVersion++;
      else singleVersion++;

      console.log(
        `    ${C.cyan}${shortName.padEnd(38)}${C.reset}` +
          `${C.bold}v${info.latestVersion}${C.reset} ` +
          `${isMulti ? C.cyan : C.gray}[${versions}]${C.reset} ` +
          `${C.gray}${info.displayName}${C.reset}`,
      );
    }
    console.log("");
  }

  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(
    `  ${C.green}${cache.totalTypes} total${C.reset}  │  ` +
      `${C.cyan}${multiVersion} multi-version${C.reset}  │  ` +
      `${C.gray}${singleVersion} single-version${C.reset}`,
  );
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}\n`,
  );
}

// ═══════════════════════════════════════════════════════════════
//  DIFF
// ═══════════════════════════════════════════════════════════════

function diffWorkflow(workflowPath: string, cache: NodeTypeCache): void {
  let wf: {
    name?: string;
    nodes?: Array<{
      name: string;
      type: string;
      typeVersion: number;
      disabled?: boolean;
    }>;
  };
  try {
    wf = JSON.parse(readFileSync(workflowPath, "utf-8"));
  } catch (err) {
    console.error(`  ${C.red}✖ ${(err as Error).message}${C.reset}`);
    return;
  }

  if (!wf.nodes || !Array.isArray(wf.nodes)) {
    console.error(`  ${C.red}✖ Workflow sin nodos${C.reset}`);
    return;
  }

  console.log(
    `\n${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(`${C.bold}  DIFF: ${wf.name || workflowPath}${C.reset}`);
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}\n`,
  );

  let ok = 0,
    warn = 0,
    errCount = 0,
    skipped = 0;

  for (const node of wf.nodes) {
    if (node.disabled) {
      skipped++;
      continue;
    }

    const installed = cache.nodeTypes[node.type];

    if (!installed) {
      console.log(
        `  ${C.red}✖ NOT INSTALLED${C.reset}  ` +
          `${C.gray}[${node.name}]${C.reset} ${node.type} v${node.typeVersion}`,
      );
      errCount++;
      continue;
    }

    if (!installed.availableVersions.includes(node.typeVersion)) {
      console.log(
        `  ${C.red}✖ BAD VERSION  ${C.reset}  ` +
          `${C.gray}[${node.name}]${C.reset} ` +
          `${node.type} ${C.red}v${node.typeVersion}${C.reset} ` +
          `${C.yellow}→ disponibles: [${installed.availableVersions.join(", ")}]${C.reset}`,
      );
      errCount++;
      continue;
    }

    if (node.typeVersion < installed.latestVersion) {
      console.log(
        `  ${C.yellow}⚠ UPGRADEABLE  ${C.reset}  ` +
          `${C.gray}[${node.name}]${C.reset} ` +
          `${node.type} v${node.typeVersion} → v${installed.latestVersion}`,
      );
      warn++;
      continue;
    }

    console.log(
      `  ${C.green}✔ OK           ${C.reset}  ` +
        `${C.gray}[${node.name}]${C.reset} ${node.type} v${node.typeVersion}`,
    );
    ok++;
  }

  console.log("");
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  console.log(
    `  ${C.green}OK: ${ok}${C.reset}  │  ` +
      `${C.yellow}UPGRADE: ${warn}${C.reset}  │  ` +
      `${C.red}ERROR: ${errCount}${C.reset}` +
      (skipped > 0 ? `  │  ${C.gray}SKIP: ${skipped}${C.reset}` : ""),
  );
  console.log(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}\n`,
  );

  process.exitCode = errCount > 0 ? 1 : 0;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const getArgValue = (flag: string): string | undefined =>
    args.find((_, i) => args[i - 1] === flag);

  const flags = {
    method: (getArgValue("--method") || "auto") as "docker" | "api" | "auto",
    container: getArgValue("--container") || DEFAULT_CONTAINER,
    file: getArgValue("--file") || DEFAULT_SSOT_FILENAME,
    verbose: args.includes("--verbose"),
    diff: getArgValue("--diff") || "",
    help: args.includes("--help") || args.includes("-h"),
  };

  if (flags.help) {
    console.log(`
  ${C.bold}N8N Node Types Discovery v3.2${C.reset}

  ${C.bold}Uso:${C.reset}
    npx tsx scripts-ts/.../discover_node_types.ts                              ${C.gray}# auto: docker → api${C.reset}
    npx tsx scripts-ts/.../discover_node_types.ts --method docker --verbose    ${C.gray}# docker + detalles${C.reset}
    npx tsx scripts-ts/.../discover_node_types.ts --method api                 ${C.gray}# solo REST API${C.reset}
    npx tsx scripts-ts/.../discover_node_types.ts --container mi_n8n           ${C.gray}# container custom${C.reset}
    npx tsx scripts-ts/.../discover_node_types.ts --file ssot-nodes.json       ${C.gray}# SSOT output${C.reset}
    npx tsx scripts-ts/.../discover_node_types.ts --diff workflows/BB_01.json  ${C.gray}# comparar workflow${C.reset}

  ${C.bold}Output SSOT format:${C.reset}
    "type": "n8n-nodes-base.if"                    ${C.gray}← coincide con workflow JSON${C.reset}
    "type": "@n8n/n8n-nodes-langchain.agent"       ${C.gray}← coincide con workflow JSON${C.reset}

  ${C.bold}Variables (.env):${C.reset}
    N8N_API_URL=https://n8n.stax.ink
    N8N_API_KEY=...           ${C.gray}# para /api/v1/*${C.reset}
    N8N_ACCESS_TOKEN=...      ${C.gray}# para /rest/*${C.reset}
`);
    return;
  }

  const env = loadEnv();

  console.log(`\n  ${C.bold}🔍 N8N Node Types Discovery v3.2${C.reset}`);
  console.log(
    `  ${C.gray}Container: ${flags.container} │ Método: ${flags.method} │ URL: ${env.apiUrl}${C.reset}`,
  );
  console.log(`  ${C.gray}SSOT file: ${flags.file}${C.reset}`);

  let nodeTypes: Record<string, DiscoveredNodeType> | null = null;
  let method = "";
  let containerName = "";
  let n8nVersion = "unknown";

  // ── DOCKER ──
  if (flags.method === "docker" || flags.method === "auto") {
    console.log(`\n  ${C.bold}📦 Docker cp + exec${C.reset}`);

    const container = detectContainer(flags.container, flags.verbose);
    if (container) {
      containerName = container;
      n8nVersion = getN8NVersion(container);
      console.log(`  ${C.gray}n8n: v${n8nVersion}${C.reset}`);

      nodeTypes = discoverViaDocker(container, flags.verbose);
      if (nodeTypes && Object.keys(nodeTypes).length > 0) {
        method = `docker cp+exec (${container})`;
        console.log(
          `  ${C.green}✔ ${Object.keys(nodeTypes).length} tipos descubiertos${C.reset}`,
        );
      } else {
        console.log(`  ${C.yellow}⚠ Sin resultados via Docker${C.reset}`);
        nodeTypes = null;
      }
    } else {
      console.log(`  ${C.yellow}⚠ No se encontró container n8n${C.reset}`);
    }
  }

  // ── API ──
  if (!nodeTypes && (flags.method === "api" || flags.method === "auto")) {
    console.log(`\n  ${C.bold}🌐 REST API${C.reset}`);

    const detected: string[] = [];
    if (env.apiKey) detected.push("API Key ✓");
    if (env.accessToken) detected.push("Access Token ✓");
    console.log(
      `  ${C.gray}Auth: ${detected.join(", ") || "ninguna"}${C.reset}`,
    );

    nodeTypes = await discoverViaAPI(env, flags.verbose);
    if (nodeTypes && Object.keys(nodeTypes).length > 0) {
      method = `REST API (${env.apiUrl})`;
      console.log(
        `  ${C.green}✔ ${Object.keys(nodeTypes).length} tipos descubiertos${C.reset}`,
      );
    } else {
      console.log(`  ${C.yellow}⚠ Sin resultados via API${C.reset}`);
    }
  }

  // ── RESULTADO ──
  if (!nodeTypes || Object.keys(nodeTypes).length === 0) {
    console.error(
      `\n  ${C.red}✖ No se pudieron descubrir node types${C.reset}`,
    );
    console.error(
      `  ${C.gray}Intentar con --verbose para diagnóstico${C.reset}`,
    );
    process.exitCode = 1;
    return;
  }

  const cache: NodeTypeCache = {
    discoveredAt: new Date().toISOString(),
    n8nBaseUrl: env.apiUrl,
    n8nVersion,
    method,
    containerName,
    totalTypes: Object.keys(nodeTypes).length,
    nodeTypes,
  };

  console.log("");
  saveCache(cache);
  saveSSOT(cache, flags.file);

  printReport(cache);

  if (flags.diff) {
    diffWorkflow(flags.diff, cache);
  }
}

main();
