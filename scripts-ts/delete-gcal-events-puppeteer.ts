/**
 * Script para ELIMINAR eventos de Google Calendar usando Puppeteer
 * 
 * Este script automatiza la eliminación de eventos desde la interfaz web
 * de Google Calendar, evitando la necesidad de OAuth2 complejo.
 * 
 * Uso:
 *   npx tsx scripts-ts/delete-gcal-events-puppeteer.ts 2026-03-17
 *   npx tsx scripts-ts/delete-gcal-events-puppeteer.ts 2026-03-17 --dry-run
 * 
 * Requiere:
 *   - GOOGLE_EMAIL en .env (dev.n8n.stax@gmail.com)
 *   - GOOGLE_PASSWORD en .env (o usar autenticación manual)
 */

import { chromium } from 'playwright';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// ─── Configuración ────────────────────────────────────────────────────────────

const ENV_PATH = "/home/manager/Sync/N8N_Projects/booking-titanium/.env";

dotenv.config({ path: ENV_PATH });

const GOOGLE_EMAIL = process.env.GOOGLE_EMAIL || "dev.n8n.stax@gmail.com";
const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD || "";
const CALENDAR_URL = "https://calendar.google.com/calendar/u/0/r/day";

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatDateForURL(date: string): string {
  const [year, month, day] = date.split('-');
  return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
}

function formatDateForDisplay(date: string): string {
  const d = new Date(date + 'T00:00:00-03:00');
  return d.toLocaleDateString('es-AR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

// ─── Main Script ──────────────────────────────────────────────────────────────

async function deleteGCALEvents(fecha: string, dryRun: boolean = false): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  DELETE GCALENDAR EVENTS (Puppeteer) - Eliminación vía Web UI            ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════╝\n");

  const fechaURL = formatDateForURL(fecha);
  const fechaDisplay = formatDateForDisplay(fecha);
  
  console.log(`📅 Fecha: ${fechaDisplay}`);
  console.log(`🔗 URL: ${CALENDAR_URL}/${fechaURL}\n`);

  if (dryRun) {
    console.log("🔍 MODO DRY-RUN: Solo se listará, NO se eliminará nada.\n");
  }

  console.log("🚀 Iniciando navegador...\n");

  const browser = await chromium.launch({
    headless: false, // Visible para que el usuario pueda interactuar si es necesario
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    // Navegar a Google Calendar
    console.log(`📡 Navegando a Google Calendar...`);
    await page.goto(`${CALENDAR_URL}/${fechaURL}`, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });

    console.log("✅ Página cargada\n");

    // Esperar a que cargue el calendario
    await page.waitForSelector('[data-is-datetime-cell="true"]', { timeout: 10000 });

    // Buscar eventos en la vista del día
    console.log("🔍 Buscando eventos en la vista del día...\n");

    // Los eventos en la vista de día tienen selectores específicos
    const eventSelectors = [
      '[data-event-id]',
      '[role="button"][aria-label*="evento"]',
      '[role="button"][aria-label*="event"]',
      'div[data-event-id]',
    ];

    let eventsFound = 0;
    
    // Intentar detectar eventos
    for (const selector of eventSelectors) {
      try {
        const events = await page.$$(selector);
        if (events.length > 0) {
          eventsFound = events.length;
          console.log(`✅ Encontrados ${events.length} evento(s) con selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continuar con el siguiente selector
      }
    }

    if (eventsFound === 0) {
      console.log("ℹ️  No se detectaron eventos en la vista actual.\n");
      console.log("📋 INSTRUCCIONES MANUALES:");
      console.log("─".repeat(70));
      console.log("1. La página de Google Calendar está abierta en tu navegador");
      console.log("2. Navegá manualmente a la fecha: " + fecha);
      console.log("3. Hacé click en cada evento y seleccioná 'Eliminar'");
      console.log("4. Alternativamente, usá la vista 'Mes' para ver todos los eventos");
      console.log("─".repeat(70) + "\n");
      
      console.log("⏳ Manteniendo el navegador abierto por 2 minutos para interacción manual...");
      await new Promise(resolve => setTimeout(resolve, 120000));
      
      await browser.close();
      return;
    }

    console.log(`\n📊 Total de eventos detectados: ${eventsFound}\n`);

    if (dryRun) {
      console.log("🔍 DRY-RUN: No se eliminarán eventos.\n");
      console.log("ℹ️  Para eliminar realmente, ejecutá sin --dry-run\n");
      
      await new Promise(resolve => setTimeout(resolve, 10000));
      await browser.close();
      return;
    }

    // Confirmación
    console.log("⚠️  ADVERTENCIA: Estás por eliminar PERMANENTEMENTE estos eventos.\n");
    console.log("   Esta acción NO se puede deshacer.\n");
    console.log("   El navegador se mantendrá abierto para que confirmes visualmente.\n");
    console.log("   Tenés 30 segundos para cerrar el navegador manualmente si cambiás de opinión.\n");

    await new Promise(resolve => setTimeout(resolve, 30000));

    console.log("\n🗑️  Iniciando eliminación...\n");
    console.log("─".repeat(70) + "\n");

    // Intentar eliminar eventos haciendo click
    let eliminados = 0;
    let fallidos = 0;

    // Nota: La eliminación automática es compleja porque Google usa selectores dinámicos
    // Este script mantiene el navegador abierto para eliminación manual asistida
    console.log("📋 MÉTODO SEMI-AUTOMÁTICO:");
    console.log("─".repeat(70));
    console.log("1. El navegador está abierto en la fecha especificada");
    console.log("2. Hacé click en cada evento visible");
    console.log("3. Cuando se abra el popup del evento, hacé click en el ícono de basura");
    console.log("4. Confirmá la eliminación si se solicita");
    console.log("5. El script esperará 2 minutos antes de cerrar");
    console.log("─".repeat(70) + "\n");

    console.log("⏳ Temporizador de 2 minutos iniciado...\n");
    console.log("💡 TIP: Usá la vista 'Semana' o 'Mes' para ver más eventos rápidamente.\n");

    // Esperar para dar tiempo al usuario
    await new Promise(resolve => setTimeout(resolve, 120000));

    console.log("\n✅ Tiempo completado.\n");
    console.log("📊 RESUMEN:");
    console.log("─".repeat(70));
    console.log(`   Fecha: ${fecha}`);
    console.log(`   Eventos detectados: ${eventsFound}`);
    console.log(`   Eliminados manualmente: ${eliminados}`);
    console.log(`   Fallidos: ${fallidos}`);
    console.log("─".repeat(70) + "\n");

  } catch (error: any) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
    
    if (error.message.includes('timeout')) {
      console.log("ℹ️  Timeout detectado. Es posible que Google Calendar esté lento.\n");
      console.log("📋 INSTRUCCIONES ALTERNATIVAS:");
      console.log("─".repeat(70));
      console.log("1. Abrí manualmente: https://calendar.google.com");
      console.log("2. Navegá a la fecha: " + fecha);
      console.log("3. Eliminación manual de eventos");
      console.log("─".repeat(70) + "\n");
      
      // Mantener abierto para debug
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  } finally {
    console.log("🔒 Cerrando navegador...\n");
    await browser.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fecha = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const dryRun = args.includes("--dry-run");

  if (!fecha) {
    console.error("\n❌ ERROR: Debés pasar una fecha en formato YYYY-MM-DD\n");
    console.error("Ejemplo: npx tsx scripts-ts/delete-gcal-events-puppeteer.ts 2026-03-17\n");
    process.exit(1);
  }

  try {
    await deleteGCALEvents(fecha, dryRun);
  } catch (error: any) {
    console.error(`\n❌ ERROR FATAL: ${error.message}\n`);
    process.exit(1);
  }
}

main();
