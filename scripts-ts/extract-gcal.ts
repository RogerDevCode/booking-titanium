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
        `  → Verifica que la ruta sea correcta y que el archivo exista.`,
    );
  }

  const result = dotenv.config({ path: ENV_PATH });

  if (result.error) {
    throw new Error(
      `[ERROR] No se pudo parsear el archivo .env en '${ENV_PATH}'.\n` +
        `  → Verifica que tenga formato KEY=VALUE válido.\n` +
        `  → Detalle: ${result.error.message}`,
    );
  }

  console.log(`[OK] Variables de entorno cargadas desde:\n  ${ENV_PATH}`);
}

// ─── Configuración ────────────────────────────────────────────────────────────

const TIMEZONE_OFFSET = "-03:00";
const CALENDAR_ID = "dev.n8n.stax@gmail.com";
const TOKEN_FILE = "token.json";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env["EXTRACT_GCAL-CLIENTE-ID"] ?? "";
  const clientSecret = process.env["EXTRACT_GCAL-CLIENTE-SECRET"] ?? "";

  if (!clientId || !clientSecret) {
    throw new Error(
      `[ERROR] Credenciales de Google Calendar no encontradas.\n` +
        `  → Verifica que existan en: ${ENV_PATH}\n` +
        `  → GCALENDAR_CLIENT_ID=...\n` +
        `  → GCALENDAR_CLIENT_SECRET=...`,
    );
  }
  return { clientId, clientSecret };
}

function getOAuth2Client(): OAuth2Client {
  const { clientId, clientSecret } = getCredentials();
  const redirectUri = "http://localhost:3000/oauth2callback";

  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  // Try to load existing token
  if (fs.existsSync(TOKEN_FILE)) {
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf-8"));
    oauth2Client.setCredentials(tokenData);
    return oauth2Client;
  }

  // No token - need to authenticate
  throw new Error(
    `[ERROR] No se encontró token de autenticación.\n` +
      `  → Ejecuta el script sin argumentos para generar el token:\n` +
      `     npx tsx scripts-ts/extract-gcal.ts\n` +
      `  → Sigue las instrucciones para autorizar el acceso.`,
  );
}

async function authenticateAndSaveToken(): Promise<void> {
  const { clientId, clientSecret } = getCredentials();
  const redirectUri = "http://localhost:3000/oauth2callback";

  const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
    prompt: "consent",
  });

  console.log("\n=== AUTENTICACIÓN GOOGLE CALENDAR ===\n");
  console.log("1. Abrí esta URL en tu navegador:");
  console.log(`   ${authUrl}`);
  console.log("\n2. Iniciá sesión con tu cuenta de Google (dev.n8n.stax@gmail.com)");
  console.log("3. Autorizá el acceso a Google Calendar");
  console.log("\n4. Si el navegador te muestra un error o 'Cannot GET /oauth2callback',");
  console.log("   ES NORMAL. Solo copia la URL completa de la barra de direcciones");
  console.log("   y pégala aquí abajo.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("Pega la URL de redirección completa aquí:\n> ", resolve);
  });
  rl.close();

  let code = "";
  try {
    const parsedUrl = new URL(answer);
    code = parsedUrl.searchParams.get("code") || "";
  } catch (e) {
    // Si pegaron solo el código
    code = answer.trim();
  }

  if (!code) {
    throw new Error("No se pudo extraer el código de autorización.");
  }

  // Canjear código por token
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Guardar token
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log(`\n[OK] Token guardado en ${TOKEN_FILE}`);
  console.log("Ahora puedes volver a ejecutar el script para extraer los eventos con una fecha.");
  console.log("Ejemplo: npx tsx scripts-ts/extract-gcal.ts 2026-03-15");
}

// ─── Validación de fecha ───────────────────────────────────────────────────────

function validateDate(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error(`[ERROR] Formato de fecha inválido: '${fecha}'.\n` + `  → Uso: npx ts-node script.ts 2026-03-12`);
  }
  if (isNaN(new Date(fecha).getTime())) {
    throw new Error(`[ERROR] '${fecha}' no es una fecha válida.`);
  }
}

// ─── Consulta Calendar API ────────────────────────────────────────────────────

interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

async function fetchEventos(oauth2Client: OAuth2Client, fecha: string): Promise<CalendarEvent[]> {
  const timeMin = `${fecha}T00:00:00${TIMEZONE_OFFSET}`;
  const timeMax = `${fecha}T23:59:59${TIMEZONE_OFFSET}`;

  console.log(`\n[INFO] Consultando eventos: ${timeMin} → ${timeMax}`);
  console.log(`[INFO] Calendar ID: ${CALENDAR_ID}`);

  try {
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });

    const cals = await calendar.calendarList.list();
    console.log("[DEBUG] Calendarios disponibles:");
    cals.data.items?.forEach((c) => console.log(`  id: ${c.id} | nombre: ${c.summary}`));

    const eventos = res.data.items ?? [];
    console.log(`[OK] ${eventos.length} evento(s) encontrado(s).`);
    return eventos;
  } catch (e: any) {
    const status = e?.code ?? e?.response?.status ?? "?";
    const message = e?.message ?? e?.response?.data?.error?.message ?? "Unknown error";

    if (status === 401 || String(message).includes("invalid_grant")) {
      // Token expirado - eliminar para forzar re-autenticación
      if (fs.existsSync(TOKEN_FILE)) {
        fs.unlinkSync(TOKEN_FILE);
      }
      throw new Error(
        `[ERROR 401] Token expirado o revocado.\n` +
          `  → Se eliminó el archivo ${TOKEN_FILE}.\n` +
          `  → Ejecuta 'npx tsx scripts-ts/extract-gcal.ts' para re-autenticar.`,
      );
    }
    if (status === 403) {
      throw new Error(
        `[ERROR 403] Sin permisos. Verifica:\n` +
          `  1. Que la Google Calendar API esté habilitada en Google Cloud Console\n` +
          `  2. Que el usuario tenga acceso al calendario\n` +
          `  → Mensaje: ${message}`,
      );
    }
    if (status === 429) {
      throw new Error(
        `[ERROR 429] Cuota excedida. Espera unos minutos e intenta de nuevo.\n` + `  → Mensaje: ${message}`,
      );
    }
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
  const lineas = [`Eventos del ${fecha}`, "=".repeat(40), ""];
  if (eventos.length === 0) {
    lineas.push("(Sin eventos para este día)");
  } else {
    eventos.forEach((e, i) => {
      const inicio = e.start?.dateTime ?? e.start?.date ?? "Sin hora";
      const fin = e.end?.dateTime ?? e.end?.date ?? "";
      lineas.push(`[${i + 1}] ${e.summary ?? "(Sin título)"}`);
      lineas.push(`    Inicio : ${inicio}`);
      if (fin) lineas.push(`    Fin    : ${fin}`);
      if (e.location) lineas.push(`    Lugar  : ${e.location}`);
      if (e.description) lineas.push(`    Notas  : ${e.description.replace(/\n/g, " ")}`);
      lineas.push("");
    });
  }
  fs.writeFileSync(archivo, lineas.join("\n"), "utf-8");
  console.log(`[OK] TXT  → ${path.resolve(archivo)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const fecha = process.argv[2];

  // Si no hay fecha, ejecutar autenticación
  if (!fecha) {
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
    cargarEnv(); // Lee .env desde ruta absoluta
    validateDate(fecha);

    // Obtener cliente OAuth2 con token guardado
    const oauth2Client = getOAuth2Client();

    // Fetch eventos
    const eventos = await fetchEventos(oauth2Client, fecha);

    // Exportar
    exportarJSON(eventos, fecha);
    exportarTXT(eventos, fecha);

    console.log(`\n[DONE] Exportación completada para el ${fecha}.`);
  } catch (e) {
    console.error(`\n${(e as Error).message}`);
    process.exit(1);
  }
}

main();
