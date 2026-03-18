/**
 * Script para ELIMINAR eventos de Google Calendar de una fecha específica
 * 
 * Uso:
 *   npx tsx scripts-ts/delete-gcal-events.ts              # Autenticar
 *   npx tsx scripts-ts/delete-gcal-events.ts 2026-03-17   # Eliminar eventos de hoy
 *   npx tsx scripts-ts/delete-gcal-events.ts 2026-03-17 --dry-run  # Solo listar
 *   npx tsx scripts-ts/delete-gcal-events.ts --list-calendars  # Listar calendarios
 * 
 * Requiere:
 *   - GCALENDAR_CLIENT_ID en .env
 *   - GCALENDAR_CLIENT_SECRET en .env
 *   - Token de autenticación (se genera en primera ejecución)
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as readline from "readline";

// ─── Configuración ────────────────────────────────────────────────────────────

const ENV_PATH = "/home/manager/Sync/N8N_Projects/booking-titanium/.env";
const TOKEN_FILE = "token.json";
const CALENDAR_ID = "dev.n8n.stax@gmail.com";

// ─── Cargar .env ──────────────────────────────────────────────────────────────

function cargarEnv(): void {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(
      `[ERROR] No se encontró el archivo .env en: ${ENV_PATH}`
    );
  }
  const result = dotenv.config({ path: ENV_PATH });
  if (result.error) {
    throw new Error(`[ERROR] No se pudo parsear .env: ${result.error.message}`);
  }
  console.log(`[OK] Variables cargadas desde: ${ENV_PATH}`);
}

// ─── Autenticación ────────────────────────────────────────────────────────────

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env["GCALENDAR_CLIENT_ID"] ?? process.env["EXTRACT_GCAL-CLIENTE-ID"] ?? "";
  const clientSecret = process.env["GCALENDAR_CLIENT_SECRET"] ?? process.env["EXTRACT_GCAL-CLIENTE-SECRET"] ?? "";
  
  if (!clientId || !clientSecret) {
    throw new Error(
      `[ERROR] Credenciales no encontradas en .env:\n` +
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
    `[ERROR] No hay token de autenticación.\n` +
      `  → Ejecutá sin argumentos para generar: npx tsx scripts-ts/delete-gcal-events.ts`
  );
}

async function authenticateAndSaveToken(): Promise<void> {
  const { clientId, clientSecret } = getCredentials();
  const oauth2Client = new OAuth2Client(clientId, clientSecret, "http://localhost:3000/oauth2callback");

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
    prompt: "consent",
  });

  console.log("\n=== AUTENTICACIÓN GOOGLE CALENDAR ===\n");
  console.log("1. Abrí esta URL en tu navegador:");
  console.log(`   ${authUrl}`);
  console.log("\n2. Iniciá sesión con: dev.n8n.stax@gmail.com");
  console.log("3. Autorizá el acceso a Google Calendar");
  console.log("\n4. Si ves 'Cannot GET /oauth2callback' o error, es NORMAL.");
  console.log("   Copiá la URL completa de la barra de direcciones y pegala abajo.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("URL de redirección completa:\n> ", resolve);
  });
  rl.close();

  let code = "";
  try {
    code = new URL(answer).searchParams.get("code") ?? "";
  } catch {
    code = answer.trim();
  }
  
  if (!code) throw new Error("No se pudo extraer el código.");

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  
  console.log(`\n[OK] Token guardado en ${TOKEN_FILE}`);
  console.log("\nAhora podés ejecutar:");
  console.log(`  npx tsx scripts-ts/delete-gcal-events.ts 2026-03-17`);
}

// ─── Listar Calendarios ───────────────────────────────────────────────────────

async function listarCalendarios(oauth2Client: OAuth2Client): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const res = await calendar.calendarList.list();
  const items = res.data.items ?? [];

  console.log(`\n[INFO] ${items.length} calendario(s) disponible(s):\n`);
  items.forEach((c, i) => {
    const primary = c.primary ? " ← PRIMARY" : "";
    console.log(`  [${i + 1}] ID      : ${c.id}${primary}`);
    console.log(`         Nombre  : ${c.summary}`);
    console.log(`         Acceso  : ${c.accessRole}`);
    console.log(`         Color   : ${c.backgroundColor ?? "N/A"}`);
    console.log();
  });
  console.log(`[TIP] Usá el campo "id" con --calendar=<id> si querés otro calendario.`);
}

// ─── Listar Eventos ───────────────────────────────────────────────────────────

interface CalendarEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
  htmlLink?: string;
}

async function listarEventos(
  oauth2Client: OAuth2Client,
  fecha: string,
  calendarId: string
): Promise<CalendarEvent[]> {
  // Usar timezone -03:00 para coincidir con extract-gcal.ts
  const timeMin = `${fecha}T00:00:00-03:00`;
  const timeMax = `${fecha}T23:59:59-03:00`;

  console.log(`\n[INFO] Buscando eventos: ${timeMin} → ${timeMax}`);
  console.log(`[INFO] Calendario: ${calendarId}`);

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
    showDeleted: true,
  });

  const eventos = res.data.items ?? [];
  console.log(`\n[OK] ${eventos.length} evento(s) encontrado(s).\n`);

  if (eventos.length === 0) {
    console.log("[INFO] No hay eventos para eliminar en esta fecha.\n");
    return [];
  }

  // Mostrar eventos
  console.log("┌─────────────────────────────────────────────────────────────────────────┐");
  console.log("│ EVENTOS ENCONTRADOS                                                     │");
  console.log("├─────────────────────────────────────────────────────────────────────────┤");
  
  eventos.forEach((e, i) => {
    const inicio = e.start?.dateTime ?? e.start?.date ?? "Sin hora";
    const fin = e.end?.dateTime ?? e.end?.date ?? "";
    const titulo = e.summary ?? "(Sin título)";
    const status = e.status ?? "confirmed";
    const id = e.id ?? "unknown";
    
    console.log(`│ [${i + 1}] ${titulo.padEnd(50)}           │`);
    console.log(`│      ID: ${id.padEnd(54)}│`);
    console.log(`│      Inicio: ${inicio.padEnd(48)}│`);
    console.log(`│      Fin: ${fin.padEnd(51)}│`);
    console.log(`│      Status: ${status.padEnd(47)}│`);
    console.log("├─────────────────────────────────────────────────────────────────────────┤");
  });
  
  console.log("\n");

  return eventos;
}

// ─── Eliminar Evento ──────────────────────────────────────────────────────────

async function eliminarEvento(
  oauth2Client: OAuth2Client,
  calendarId: string,
  eventId: string,
  dryRun: boolean = false
): Promise<boolean> {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  
  if (dryRun) {
    console.log(`   [DRY-RUN] Evento NO eliminado: ${eventId}`);
    return true;
  }

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    });
    console.log(`   ✅ ELIMINADO: ${eventId}`);
    return true;
  } catch (error: any) {
    const message = error?.response?.data?.error?.message ?? error.message ?? "Unknown error";
    console.log(`   ❌ ERROR: ${eventId} - ${message}`);
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fecha = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const dryRun = args.includes("--dry-run");
  const listCals = args.includes("--list-calendars");
  const calendarArg = args.find(a => a.startsWith("--calendar="))?.split("=")[1];

  console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  DELETE GCALENDAR EVENTS - Eliminación masiva de eventos                 ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════╝\n");

  try {
    cargarEnv();

    // Sin argumentos → autenticar
    if (args.length === 0) {
      await authenticateAndSaveToken();
      return;
    }

    const oauth2Client = getOAuth2Client();

    // --list-calendars → listar calendarios
    if (listCals) {
      await listarCalendarios(oauth2Client);
      return;
    }

    // Validar fecha
    if (!fecha) {
      console.error("[ERROR] Debés pasar una fecha: YYYY-MM-DD");
      console.error("Ejemplo: npx tsx scripts-ts/delete-gcal-events.ts 2026-03-17");
      process.exit(1);
    }

    const calendarId = calendarArg ?? CALENDAR_ID;

    // Listar eventos
    const eventos = await listarEventos(oauth2Client, fecha, calendarId);

    if (eventos.length === 0) {
      console.log("[INFO] No hay eventos para eliminar. Saliendo...\n");
      return;
    }

    // Confirmar eliminación
    if (!dryRun) {
      console.log("⚠️  ADVERTENCIA: Estás por eliminar PERMANENTEMENTE estos eventos.\n");
      console.log(`   Fecha: ${fecha}`);
      console.log(`   Calendario: ${calendarId}`);
      console.log(`   Eventos a eliminar: ${eventos.length}`);
      console.log("\n   Esta acción NO se puede deshacer.\n");

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((resolve) => {
        rl.question("¿Estás SEGURO de que querés eliminar TODOS estos eventos? (yes/no): ", resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== "yes") {
        console.log("\n[INFO] Operación cancelada por el usuario.\n");
        return;
      }
      console.log("\n");
    } else {
      console.log("🔍 MODO DRY-RUN: Solo se listará, NO se eliminará nada.\n");
    }

    // Eliminar eventos
    console.log(dryRun ? "📋 LISTANDO eventos:" : "🗑️  ELIMINANDO eventos:");
    console.log("─".repeat(70) + "\n");

    let eliminados = 0;
    let fallidos = 0;

    for (const evento of eventos) {
      if (evento.id) {
        const exito = await eliminarEvento(oauth2Client, calendarId, evento.id, dryRun);
        if (exito) eliminados++;
        else fallidos++;

        // Pequeña pausa para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Resumen final
    console.log("\n" + "═".repeat(70));
    console.log("📊 RESUMEN:");
    console.log("─".repeat(70));
    console.log(`   Fecha: ${fecha}`);
    console.log(`   Calendario: ${calendarId}`);
    console.log(`   Total eventos: ${eventos.length}`);
    console.log(`   Eliminados: ${eliminados} ${dryRun ? "(dry-run)" : "✅"}`);
    console.log(`   Fallidos: ${fallidos}`);
    console.log("═".repeat(70) + "\n");

    if (!dryRun && eliminados > 0) {
      console.log("✅ ¡Limpieza completada exitosamente!\n");
    } else if (dryRun) {
      console.log("ℹ️  Dry-run completado. Para eliminar realmente, ejecutá sin --dry-run\n");
    }

  } catch (error: any) {
    console.error(`\n❌ ERROR FATAL: ${error.message}\n`);
    
    if (error.message.includes("Token expirado") || error.message.includes("invalid_grant")) {
      console.log("[INFO] Token expirado. Eliminando token.json...");
      if (fs.existsSync(TOKEN_FILE)) {
        fs.unlinkSync(TOKEN_FILE);
      }
      console.log("[INFO] Volvé a ejecutar para re-autenticar.\n");
    }
    
    process.exit(1);
  }
}

main();
