#!/usr/bin/env tsx
/**
 * n8n_get_execution_error.ts - Recuperar errores de ejecución de workflows
 * =========================================================================
 *
 * Consulta la API REST de n8n para obtener los errores de ejecución
 * de un workflow específico o de las últimas N ejecuciones globales.
 *
 * USAGE:
 *   npx tsx scripts-ts/n8n_get_execution_error.ts --help
 *   npx tsx scripts-ts/n8n_get_execution_error.ts --name RAG_01_Document_Ingestion
 *   npx tsx scripts-ts/n8n_get_execution_error.ts --id <execution_id>
 *   npx tsx scripts-ts/n8n_get_execution_error.ts --name RAG_01 --last 5
 *   npx tsx scripts-ts/n8n_get_execution_error.ts --last 10 --status error
 *   npx tsx scripts-ts/n8n_get_execution_error.ts --name RAG_01 --verbose
 *
 * OPTIONS:
 *   --name, -n      Nombre del workflow (filtra ejecuciones de ese workflow)
 *   --id, -i        ID de ejecución específica (muestra detalle completo)
 *   --last, -l      Número de ejecuciones a recuperar (default: 5, max: 100)
 *   --status, -s    Filtrar por status: error | success | waiting | running
 *   --verbose, -v   Mostrar stack trace completo y datos de cada nodo
 *   --url           Override N8N_API_URL
 *   --api-key       Override N8N_API_KEY
 *   --help, -h      Show help message
 */

import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "util";
import axios from "axios";
import * as dotenv from "dotenv";

// ─── Load .env ────────────────────────────────────────────────────────────────
const possibleEnvPaths = [
  path.join(process.cwd(), ".env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
    break;
  }
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  RED: "\x1b[91m",
  GREEN: "\x1b[92m",
  YELLOW: "\x1b[93m",
  CYAN: "\x1b[96m",
  GREY: "\x1b[90m",
  WHITE: "\x1b[97m",
  MAGENTA: "\x1b[95m",
};

const log = {
  ok: (msg: string) => console.log(`${C.GREEN}✅ ${msg}${C.RESET}`),
  err: (msg: string) => console.error(`${C.RED}❌ ${msg}${C.RESET}`),
  warn: (msg: string) => console.warn(`${C.YELLOW}⚠️  ${msg}${C.RESET}`),
  info: (msg: string) => console.log(`${C.CYAN}ℹ  ${msg}${C.RESET}`),
  dim: (msg: string) => console.log(`${C.GREY}${msg}${C.RESET}`),
  header: (msg: string) => console.log(`\n${C.BOLD}${msg}${C.RESET}`),
  sep: () => console.log(`${C.GREY}${"─".repeat(70)}${C.RESET}`),
};

// ─── Config ───────────────────────────────────────────────────────────────────
function loadConfig(options: { url?: string; apiKey?: string }) {
  const apiUrl =
    options.url ||
    process.env.N8N_API_URL ||
    process.env.N8N_HOST ||
    "https://n8n.stax.ink";

  const apiKey =
    options.apiKey ||
    process.env.X_N8N_API_KEY ||
    process.env.N8N_API_KEY ||
    process.env.N8N_ACCESS_TOKEN;

  if (!apiUrl) throw new Error("N8N_API_URL no configurado. Usa --url o .env");
  if (!apiKey)
    throw new Error(
      "API Key no configurada. Usa --api-key o N8N_API_KEY en .env\n" +
        "Genera una en: Settings → API → Create API Key",
    );

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return "N/A";
  return new Date(iso).toLocaleString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(startedAt: string, stoppedAt: string): string {
  if (!startedAt || !stoppedAt) return "N/A";
  const ms = new Date(stoppedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "error":
      return `${C.RED}● ERROR${C.RESET}`;
    case "success":
      return `${C.GREEN}● SUCCESS${C.RESET}`;
    case "running":
      return `${C.CYAN}● RUNNING${C.RESET}`;
    case "waiting":
      return `${C.YELLOW}● WAITING${C.RESET}`;
    case "crashed":
      return `${C.RED}● CRASHED${C.RESET}`;
    default:
      return `${C.GREY}● ${status.toUpperCase()}${C.RESET}`;
  }
}

// ─── Resolver: workflow name → ID ────────────────────────────────────────────
async function resolveWorkflowId(
  client: any,
  name: string,
): Promise<string | null> {
  let cursor: string | null = null;
  let found: string | null = null;

  do {
    const url = cursor
      ? `/workflows?limit=50&cursor=${cursor}`
      : "/workflows?limit=50";
    const resp = await client.get(url);
    if (resp.status !== 200) break;

    const matches = (resp.data.data || []).filter((w: any) => w.name === name);
    if (matches.length > 0) {
      if (matches.length > 1) {
        log.warn(
          `${matches.length} workflows con nombre '${name}' — usando el más reciente`,
        );
        matches.sort(
          (a: any, b: any) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      }
      found = matches[0].id;
      break;
    }
    cursor = resp.data.nextCursor || null;
  } while (cursor);

  return found;
}

// ─── Print single execution detail ───────────────────────────────────────────
function printExecutionDetail(exec: any, verbose: boolean): void {
  const status = exec.status || (exec.finished ? "success" : "running");
  const duration = formatDuration(exec.startedAt, exec.stoppedAt);

  log.sep();
  console.log(`${C.BOLD}Ejecución ID:${C.RESET} ${C.CYAN}${exec.id}${C.RESET}`);
  console.log(
    `${C.BOLD}Workflow:${C.RESET}     ${exec.workflowId} ${exec.workflowData?.name ? `(${exec.workflowData.name})` : ""}`,
  );
  console.log(`${C.BOLD}Status:${C.RESET}       ${statusBadge(status)}`);
  console.log(`${C.BOLD}Inicio:${C.RESET}       ${formatDate(exec.startedAt)}`);
  console.log(`${C.BOLD}Fin:${C.RESET}          ${formatDate(exec.stoppedAt)}`);
  console.log(`${C.BOLD}Duración:${C.RESET}     ${duration}`);
  console.log(`${C.BOLD}Modo:${C.RESET}         ${exec.mode || "N/A"}`);

  // ── Error principal ──────────────────────────────────────────────────────
  const errorData = exec.data?.resultData?.error || exec.data?.error;
  if (errorData) {
    console.log(`\n${C.RED}${C.BOLD}ERROR:${C.RESET}`);
    console.log(
      `  ${C.RED}Mensaje:${C.RESET}  ${errorData.message || "Sin mensaje"}`,
    );
    if (errorData.description) {
      console.log(`  ${C.RED}Detalle:${C.RESET}  ${errorData.description}`);
    }
    if (errorData.node) {
      console.log(
        `  ${C.RED}Nodo:${C.RESET}     ${errorData.node.name || errorData.node}`,
      );
    }
    if (verbose && errorData.stack) {
      console.log(`\n  ${C.GREY}Stack trace:${C.RESET}`);
      errorData.stack.split("\n").forEach((line: string) => {
        console.log(`  ${C.GREY}${line}${C.RESET}`);
      });
    }
  }

  // ── Nodos ejecutados ──────────────────────────────────────────────────────
  const runData = exec.data?.resultData?.runData;
  if (runData && Object.keys(runData).length > 0) {
    console.log(`\n${C.BOLD}Nodos ejecutados:${C.RESET}`);

    for (const [nodeName, nodeRuns] of Object.entries(
      runData as Record<string, any[]>,
    )) {
      const lastRun = (nodeRuns as any[])[nodeRuns.length - 1];
      const nodeStatus = lastRun?.error ? "error" : "success";
      const badge =
        nodeStatus === "error"
          ? `${C.RED}✗${C.RESET}`
          : `${C.GREEN}✓${C.RESET}`;

      const execTime = lastRun?.executionTime
        ? `${lastRun.executionTime}ms`
        : "N/A";

      console.log(
        `  ${badge} ${C.WHITE}${nodeName}${C.RESET} ${C.GREY}(${execTime})${C.RESET}`,
      );

      // Error del nodo
      if (lastRun?.error) {
        console.log(
          `      ${C.RED}→ ${lastRun.error.message || JSON.stringify(lastRun.error)}${C.RESET}`,
        );
        if (verbose && lastRun.error.description) {
          console.log(
            `      ${C.GREY}  ${lastRun.error.description}${C.RESET}`,
          );
        }
        if (verbose && lastRun.error.stack) {
          lastRun.error.stack
            .split("\n")
            .slice(0, 5)
            .forEach((line: string) => {
              console.log(`      ${C.GREY}  ${line}${C.RESET}`);
            });
        }
      }

      // Output del nodo (solo en verbose)
      if (verbose && lastRun?.data?.main) {
        const items = lastRun.data.main[0];
        if (items && items.length > 0) {
          const preview = JSON.stringify(items[0]?.json || {}).substring(
            0,
            120,
          );
          console.log(`      ${C.GREY}→ output[0]: ${preview}${C.RESET}`);
        }
      }
    }
  }

  // ── Last node output (Standard Contract) ─────────────────────────────────
  const lastNodeData = exec.data?.resultData?.lastNodeExecuted;
  if (lastNodeData && runData?.[lastNodeData]) {
    const lastRuns = runData[lastNodeData];
    const lastRunData =
      lastRuns[lastRuns.length - 1]?.data?.main?.[0]?.[0]?.json;
    if (lastRunData && verbose) {
      console.log(`\n${C.BOLD}Output final (${lastNodeData}):${C.RESET}`);
      console.log(
        `  ${C.GREY}${JSON.stringify(lastRunData, null, 2).split("\n").join("\n  ")}${C.RESET}`,
      );
    }
  }
}

// ─── Print execution list (summary) ──────────────────────────────────────────
function printExecutionList(executions: any[]): void {
  if (executions.length === 0) {
    log.warn("No se encontraron ejecuciones con los filtros aplicados.");
    return;
  }

  console.log(
    `\n${C.BOLD}${"ID".padEnd(22)}${"STATUS".padEnd(16)}${"INICIO".padEnd(22)}${"DURACIÓN".padEnd(12)}MODO${C.RESET}`,
  );
  log.sep();

  for (const exec of executions) {
    const status = exec.status || (exec.finished ? "success" : "running");
    const duration = formatDuration(exec.startedAt, exec.stoppedAt);
    const date = formatDate(exec.startedAt);
    const mode = exec.mode || "N/A";

    const statusStr =
      status === "error"
        ? `${C.RED}● ERROR${C.RESET}  `
        : status === "success"
          ? `${C.GREEN}● OK${C.RESET}     `
          : status === "crashed"
            ? `${C.RED}● CRASH${C.RESET}  `
            : `${C.YELLOW}● ${status.toUpperCase().padEnd(7)}${C.RESET}`;

    console.log(
      `${C.CYAN}${exec.id.padEnd(22)}${C.RESET}` +
        `${statusStr.padEnd(16)}` +
        `${date.padEnd(22)}` +
        `${duration.padEnd(12)}` +
        `${mode}`,
    );

    // Mostrar error breve en la lista
    const errorMsg =
      exec.data?.resultData?.error?.message || exec.data?.error?.message;
    if (errorMsg) {
      console.log(
        `  ${C.RED}↳ ${errorMsg.substring(0, 80)}${errorMsg.length > 80 ? "..." : ""}${C.RESET}`,
      );
    }
  }
}

// ─── Help ─────────────────────────────────────────────────────────────────────
function showHelp(): void {
  console.log(`
${C.BOLD}n8n_get_execution_error.ts - Recuperar errores de ejecución${C.RESET}
═══════════════════════════════════════════════════════════════════════════════

${C.BOLD}USAGE:${C.RESET}
  npx tsx scripts-ts/n8n_get_execution_error.ts [OPTIONS]

${C.BOLD}OPTIONS:${C.RESET}
  --name <n>, -n <n>        Nombre del workflow (filtra sus ejecuciones)
  --id <id>, -i <id>        ID de ejecución específica (detalle completo)
  --last <n>, -l <n>        Últimas N ejecuciones (default: 5, max: 100)
  --status <s>, -s <s>      Filtrar: error | success | waiting | running
  --verbose, -v             Mostrar stack trace + datos de cada nodo
  --url <url>               Override N8N_API_URL
  --api-key <key>           Override N8N_API_KEY
  --help, -h                Show this help

${C.BOLD}EJEMPLOS:${C.RESET}
  ${C.CYAN}# Ver últimos 5 errores de un workflow${C.RESET}
  npx tsx scripts-ts/n8n_get_execution_error.ts --name RAG_01_Document_Ingestion --status error

  ${C.CYAN}# Ver detalle completo de una ejecución específica${C.RESET}
  npx tsx scripts-ts/n8n_get_execution_error.ts --id abc123xyz

  ${C.CYAN}# Ver últimas 10 ejecuciones de cualquier workflow${C.RESET}
  npx tsx scripts-ts/n8n_get_execution_error.ts --last 10

  ${C.CYAN}# Ver con stack trace completo${C.RESET}
  npx tsx scripts-ts/n8n_get_execution_error.ts --name RAG_01 --last 1 --verbose

  ${C.CYAN}# Ver todos los errores recientes (todos los workflows)${C.RESET}
  npx tsx scripts-ts/n8n_get_execution_error.ts --last 20 --status error

${C.BOLD}ENVIRONMENT:${C.RESET}
  N8N_API_URL     URL de tu instancia n8n
  N8N_API_KEY     API Key (Settings → API → Create API Key)

═══════════════════════════════════════════════════════════════════════════════
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run(): Promise<void> {
  let args;
  try {
    args = parseArgs({
      options: {
        name: { type: "string", short: "n" },
        id: { type: "string", short: "i" },
        last: { type: "string", short: "l", default: "5" },
        status: { type: "string", short: "s" },
        verbose: { type: "boolean", short: "v" },
        url: { type: "string" },
        "api-key": { type: "string" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
  } catch (err: any) {
    log.err(`Error de argumentos: ${err.message}`);
    process.exit(1);
  }

  const { values } = args;

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  const { client, baseUrl } = loadConfig({
    url: values.url,
    apiKey: values["api-key"],
  });

  const limit = Math.min(
    Math.max(1, parseInt(values.last as string, 10) || 5),
    100,
  );
  const verbose = values.verbose === true;

  // ── Test conexión ──────────────────────────────────────────────────────────
  log.info(`Conectando a ${baseUrl}...`);
  const testResp = await client.get("/workflows?limit=1");
  if (testResp.status === 401 || testResp.status === 403) {
    log.err(
      `Auth fallida (HTTP ${testResp.status}). Verifica N8N_API_KEY en .env`,
    );
    process.exit(1);
  }
  log.ok("Conexión OK");

  // ── MODO 1: Ejecución específica por ID ───────────────────────────────────
  if (values.id) {
    log.header(`[MODO] Detalle de ejecución: ${values.id}`);
    log.info(`GET /executions/${values.id}?includeData=true`);

    const resp = await client.get(`/executions/${values.id}?includeData=true`);

    if (resp.status === 404) {
      log.err(`Ejecución '${values.id}' no encontrada.`);
      process.exit(1);
    }
    if (resp.status !== 200) {
      log.err(
        `Error ${resp.status}: ${JSON.stringify(resp.data).substring(0, 200)}`,
      );
      process.exit(1);
    }

    printExecutionDetail(resp.data, verbose);
    console.log();
    process.exit(0);
  }

  // ── MODO 2: Lista de ejecuciones (con filtros opcionales) ─────────────────
  log.header(
    values.name
      ? `[MODO] Ejecuciones de workflow: ${values.name}`
      : `[MODO] Últimas ${limit} ejecuciones globales`,
  );

  // Resolver workflow name → ID si se especificó --name
  let workflowId: string | null = null;
  if (values.name) {
    log.info(`Resolviendo ID de '${values.name}'...`);
    workflowId = await resolveWorkflowId(client, values.name as string);
    if (!workflowId) {
      log.err(`Workflow '${values.name}' no encontrado en el servidor.`);
      process.exit(1);
    }
    log.ok(`Workflow ID: ${workflowId}`);
  }

  // Construir URL de executions
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("includeData", "true");
  if (workflowId) params.set("workflowId", workflowId);
  if (values.status) params.set("status", values.status as string);

  log.info(`GET /executions?${params.toString()}`);
  const execResp = await client.get(`/executions?${params.toString()}`);

  if (execResp.status !== 200) {
    log.err(
      `Error ${execResp.status}: ${JSON.stringify(execResp.data).substring(0, 300)}`,
    );
    process.exit(1);
  }

  const executions: any[] = execResp.data.data || [];
  const total = execResp.data.count ?? executions.length;

  log.ok(
    `${executions.length} ejecuciones recuperadas (total en servidor: ${total})`,
  );

  if (executions.length === 0) {
    log.warn("No se encontraron ejecuciones con los filtros aplicados.");
    process.exit(0);
  }

  // ── Mostrar resultados ────────────────────────────────────────────────────
  if (verbose || executions.length === 1) {
    // Detalle completo de cada ejecución
    for (const exec of executions) {
      printExecutionDetail(exec, verbose);
    }
  } else {
    // Vista resumen en tabla
    printExecutionList(executions);

    // Si hay errores, mostrar detalle del más reciente automáticamente
    const firstError = executions.find(
      (e) => (e.status || (e.finished ? "success" : "running")) === "error",
    );
    if (firstError) {
      console.log(`\n${C.BOLD}Detalle del error más reciente:${C.RESET}`);
      printExecutionDetail(firstError, false);
      console.log(
        `\n${C.GREY}💡 Usa --verbose para ver stack trace completo${C.RESET}`,
      );
      console.log(
        `${C.GREY}💡 Usa --id ${firstError.id} para ver solo esta ejecución${C.RESET}`,
      );
    }
  }

  // ── Estadísticas rápidas ──────────────────────────────────────────────────
  const stats = executions.reduce(
    (acc: Record<string, number>, e: any) => {
      const s = e.status || (e.finished ? "success" : "running");
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`\n${C.BOLD}Resumen:${C.RESET}`);
  for (const [status, count] of Object.entries(stats)) {
    console.log(`  ${statusBadge(status)}  ${count}`);
  }
  console.log();
}

run().catch((e) => {
  log.err(`Error fatal: ${e.message}`);
  if (process.env.DEBUG) console.error(e);
  process.exit(1);
});
