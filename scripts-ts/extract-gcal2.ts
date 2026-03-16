import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as readline from "readline";

// ─── Ruta absoluta al .env ─────────────────────────────────────────────────────

const ENV_PATH = "/home/manager/Sync/N8N_Projects/booking-titanium/.env";

function cargarEnv(): void {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(
      `[ERROR] No se encontró el archivo .env en la ruta configurada:\n` +
        `  → ${ENV_PATH}\n` +
        `  → Verifica que la ruta sea correcta y que el archivo exista.`
    );
  }
  const result = dotenv.config({ path: ENV_PATH });
  if (result.error) {
    throw new Error(
      `[ERROR] No se pudo parsear el archivo .env en '${ENV_PATH}'.\n` +
        `  → Verifica que tenga formato KEY=VALUE válido.\n` +
        `  → Detalle: ${result.error.message}`
    );
  }
  console.log(`[OK] Variables de entorno cargadas desde:\n  ${ENV_PATH}`);
}

// ─── Configuración ────────────────────────────────────────────────────────────

// FIX: ya no usamos TIMEZONE_OFFSET hardcodeado.
// Los eventos creados por n8n usan UTC puro (toISOString() → "Z").
// Consultamos siempre en UTC para no perder eventos por desfase horario.

const CALENDAR_ID = "dev.n8n.stax@gmail.com";
const TOKEN_FILE  = "token.json";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId     = process.env["GCALENDAR_CLIENT_ID"]     ?? "";
  const clientSecret = process.env["GCALENDAR_CLIENT_SECRET"] ?? "";
  if (!clientId || !clientSecret) {
    throw new Error(
      `[ERROR] Credenciales de Google Calendar no encontradas.\n` +
        `  → Verifica que existan en: ${ENV_PATH}\n` +
        `  → GCALENDAR_CLIENT_ID=...\n` +
        `  → GCALENDAR_CLIENT_SECRET=...`
    );
  }
  return { clientId, clientSecret };
}

function getOAuth2Client(): OAuth2Client {
  const { clientId, clientSecret } = getCredentials();
  const oauth2Client = new OAuth2Client(clientId, clientSecret, "http://localhost:3000/oauth2callback");
  if (fs.existsSync(TOKEN_FILE)) {
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    oauth2Client.setCredentials(tokenData);
    return oauth2Client;
  }
  throw new Error(
    `[ERROR] No se encontró token de autenticación.\n` +
      `  → Ejecuta sin argumentos para generar el token:\n` +
      `     npx tsx extract-gcal.ts\n` +
      `  → Sigue las instrucciones para autorizar el acceso.`
  );
}

async function authenticateAndSaveToken(): Promise<void> {
  const { clientId, clientSecret } = getCredentials();
  const oauth2Client = new OAuth2Client(clientId, clientSecret, "http://localhost:3000/oauth2callback");

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
    prompt: "consent",
  });

  console.log("\n=== AUTENTICACIÓN GOOGLE CALENDAR ===\n");
  console.log("1. Abrí esta URL en tu navegador:");
  console.log(`   ${authUrl}`);
  console.log("\n2. Iniciá sesión con: dev.n8n.stax@gmail.com");
  console.log("3. Autorizá el acceso a Google Calendar");
  console.log("\n4. Si el navegador muestra error o 'Cannot GET /oauth2callback',");
  console.log("   es NORMAL. Copia la URL completa de la barra de direcciones");
  console.log("   y pégala abajo.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("Pegá la URL de redirección completa aquí:\n> ", resolve);
  });
  rl.close();

  let code = "";
  try {
    code = new URL(answer).searchParams.get("code") ?? "";
  } catch {
    code = answer.trim();
  }
  if (!code) throw new Error("No se pudo extraer el código de autorización.");

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log(`\n[OK] Token guardado en ${TOKEN_FILE}`);
  console.log("Ahora podés ejecutar: npx tsx extract-gcal.ts 2026-03-15");
}

// ─── Validación de fecha ───────────────────────────────────────────────────────

function validateDate(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error(
      `[ERROR] Formato de fecha inválido: '${fecha}'.\n` +
        `  → Uso: npx tsx extract-gcal.ts 2026-03-15`
    );
  }
  if (isNaN(new Date(fecha).getTime())) {
    throw new Error(`[ERROR] '${fecha}' no es una fecha válida.`);
  }
}

// ─── Listado de calendarios (diagnóstico) ─────────────────────────────────────

/**
 * Lista todos los calendarios disponibles en la cuenta.
 * Útil para verificar qué calendarId usar cuando aparecen 0 eventos.
 * Correr con: npx tsx extract-gcal.ts --list-calendars
 */
async function listarCalendarios(oauth2Client: OAuth2Client): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const res = await calendar.calendarList.list();
  const items = res.data.items ?? [];

  console.log(`\n[INFO] ${items.length} calendario(s) en la cuenta:\n`);
  items.forEach((c, i) => {
    const primary = c.primary ? " ← PRIMARY" : "";
    console.log(`  [${i + 1}] id      : ${c.id}${primary}`);
    console.log(`       nombre  : ${c.summary}`);
    console.log(`       acceso  : ${c.accessRole}`);
    console.log(`       color   : ${c.backgroundColor ?? "N/A"}`);
    console.log();
  });
  console.log(`[TIP] Usá el campo "id" en CALENDAR_ID del script.`);
}

// ─── Consulta Calendar API ────────────────────────────────────────────────────

interface CalendarEvent {
  id?:          string;
  summary?:     string;
  description?: string;
  location?:    string;
  start?:       { dateTime?: string; date?: string; timeZone?: string };
  end?:         { dateTime?: string; date?: string; timeZone?: string };
  status?:      string;
  htmlLink?:    string;
}

/**
 * FIX PRINCIPAL: usa UTC puro para el rango.
 *
 * Por qué era 0 eventos:
 *   - El script original usaba "-03:00" → timeMin = 2026-03-15T03:00:00Z
 *   - Los eventos creados por n8n usan toISOString() → UTC puro ("Z")
 *   - Eventos entre 00:00Z y 02:59Z del 15 quedaban FUERA del rango
 *
 * Fix: timeMin = inicio del día en UTC, timeMax = fin del día en UTC.
 * Esto captura TODOS los eventos del día sin importar el timezone de creación.
 *
 * Si querés filtrar por hora local argentina (-03:00), podés pasar --tz=America/Argentina/Buenos_Aires
 * pero para debug y extracción completa, UTC cubre todo.
 */
async function fetchEventos(
  oauth2Client: OAuth2Client,
  fecha: string,
  calendarId = CALENDAR_ID
): Promise<CalendarEvent[]> {
  // UTC puro: de 00:00:00Z a 23:59:59Z del día pedido
  const timeMin = `${fecha}T00:00:00Z`;
  const timeMax = `${fecha}T23:59:59Z`;

  console.log(`\n[INFO] Rango UTC  : ${timeMin} → ${timeMax}`);
  console.log(`[INFO] Equivale a : ${new Date(timeMin).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} → ${new Date(timeMax).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} (ARG)`);
  console.log(`[INFO] Calendar ID: ${calendarId}`);

  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const res = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,   // expande eventos recurrentes en instancias individuales
      orderBy:     "startTime",
      maxResults:  250,
      showDeleted: true,     // incluye eventos cancelados (status: "cancelled")
      showHiddenInvitations: true,  // incluye invitaciones ocultas
    });

    const eventos = res.data.items ?? [];
    console.log(`[OK] ${eventos.length} evento(s) encontrado(s).`);

    if (eventos.length === 0) {
      console.log(`\n[DIAGNÓSTICO] 0 eventos encontrados.`);
      console.log(`  showDeleted=true está activo — incluye eventos cancelados.`);
      console.log(`  Si seguís viendo 0, los eventos realmente no existen en este calendario.`);
      console.log(`  Verificá en calendar.google.com en qué calendario están los eventos.`);
    } else {
      // Mostrar breakdown por status
      const byStatus: Record<string, number> = {};
      eventos.forEach(e => {
        const s = (e as any).status ?? "confirmed";
        byStatus[s] = (byStatus[s] ?? 0) + 1;
      });
      console.log(`[INFO] Por status: ${JSON.stringify(byStatus)}`);
    }

    return eventos;
  } catch (e: any) {
    const status  = e?.code ?? e?.response?.status ?? "?";
    const message = e?.message ?? e?.response?.data?.error?.message ?? "Unknown error";

    if (status === 401 || String(message).includes("invalid_grant")) {
      if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
      throw new Error(
        `[ERROR 401] Token expirado o revocado.\n` +
          `  → Se eliminó ${TOKEN_FILE}.\n` +
          `  → Ejecutá 'npx tsx extract-gcal.ts' para re-autenticar.`
      );
    }
    if (status === 403) throw new Error(`[ERROR 403] Sin permisos. Verificá que la Calendar API esté habilitada.\n  → ${message}`);
    if (status === 429) throw new Error(`[ERROR 429] Cuota excedida. Esperá unos minutos.\n  → ${message}`);
    throw new Error(`[ERROR] API falló (HTTP ${status}): ${message}`);
  }
}

// ─── Exportación ──────────────────────────────────────────────────────────────

function exportarJSON(eventos: CalendarEvent[], fecha: string): void {
  const archivo = `eventos_${fecha}.json`;
  fs.writeFileSync(archivo, JSON.stringify(eventos, null, 2), "utf-8");
  console.log(`[OK] JSON → ${path.resolve(archivo)}`);
}

function exportarTXT(eventos: CalendarEvent[], fecha: string): void {
  const archivo = `eventos_${fecha}.txt`;
  const lineas  = [`Eventos del ${fecha} (UTC)`, "=".repeat(44), ""];

  if (eventos.length === 0) {
    lineas.push("(Sin eventos para este día)");
  } else {
    eventos.forEach((e, i) => {
      const inicio = e.start?.dateTime ?? e.start?.date ?? "Sin hora";
      const fin    = e.end?.dateTime   ?? e.end?.date   ?? "";
      // Mostrar hora en formato legible Argentina
      const inicioARG = e.start?.dateTime
        ? new Date(e.start.dateTime).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
        : inicio;
      lineas.push(`[${i + 1}] ${e.summary ?? "(Sin título)"}`);
      lineas.push(`    Inicio UTC : ${inicio}`);
      lineas.push(`    Inicio ARG : ${inicioARG}`);
      if (fin) lineas.push(`    Fin UTC    : ${fin}`);
      if (e.location)    lineas.push(`    Lugar      : ${e.location}`);
      if (e.description) lineas.push(`    Notas      : ${e.description.replace(/\n/g, " ")}`);
      if (e.status)      lineas.push(`    Status     : ${e.status}`);
      if (e.htmlLink)    lineas.push(`    Link       : ${e.htmlLink}`);
      lineas.push("");
    });
  }
  fs.writeFileSync(archivo, lineas.join("\n"), "utf-8");
  console.log(`[OK] TXT  → ${path.resolve(archivo)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args  = process.argv.slice(2);
  const fecha = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const wide  = args.includes("--wide");
  const listCals = args.includes("--list-calendars");

  // Sin argumentos → flujo de autenticación
  if (args.length === 0) {
    try {
      cargarEnv();
      await authenticateAndSaveToken();
    } catch (e) {
      console.error(`\n${(e as Error).message}`);
      process.exit(1);
    }
    return;
  }

  try {
    cargarEnv();
    const oauth2Client = getOAuth2Client();

    // --list-calendars → mostrar todos los calendarios y salir
    if (listCals) {
      await listarCalendarios(oauth2Client);
      return;
    }

    if (!fecha) {
      console.error(`[ERROR] Debés pasar una fecha en formato YYYY-MM-DD.`);
      console.error(`  Ejemplo: npx tsx extract-gcal.ts 2026-03-15`);
      console.error(`  Listar calendarios: npx tsx extract-gcal.ts --list-calendars`);
      process.exit(1);
    }

    validateDate(fecha);

    // --wide: ampliar rango ±1 día para capturar eventos en cualquier timezone
    let timeMin = `${fecha}T00:00:00Z`;
    let timeMax = `${fecha}T23:59:59Z`;
    if (wide) {
      const d = new Date(fecha);
      d.setDate(d.getDate() - 1);
      const prev = d.toISOString().split("T")[0];
      d.setDate(d.getDate() + 2);
      const next = d.toISOString().split("T")[0];
      timeMin = `${prev}T00:00:00Z`;
      timeMax = `${next}T23:59:59Z`;
      console.log(`[INFO] Modo --wide: rango ampliado a ${timeMin} → ${timeMax}`);
    }

    const eventos = await fetchEventos(oauth2Client, fecha, CALENDAR_ID);
    exportarJSON(eventos, fecha);
    exportarTXT(eventos, fecha);

    console.log(`\n[DONE] Exportación completada para el ${fecha}.`);
  } catch (e) {
    console.error(`\n${(e as Error).message}`);
    process.exit(1);
  }
}

main();
