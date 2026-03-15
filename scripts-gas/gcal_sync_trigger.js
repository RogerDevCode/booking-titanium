/**
 * Google Apps Script para notificar cambios de Calendar a n8n
 * 
 * Instrucciones de instalación:
 * 1. Ir a https://script.google.com/
 * 2. Crear nuevo proyecto
 * 3. Pegar este código
 * 4. Configurar trigger de tiempo (cada 1-5 minutos)
 * 5. Reemplazar N8N_WEBHOOK_URL con tu URL real
 * 
 * Alternativa con Google Calendar Push Notifications:
 * https://developers.google.com/calendar/api/guides/push
 * Requiere Google Cloud Console y verificación de dominio
 */

// CONFIGURACIÓN
const N8N_WEBHOOK_URL = 'https://n8n.stax.ink/webhook/gcal-sync-trigger';
const CALENDAR_ID = 'dev.n8n.stax@gmail.com'; // Tu calendar ID
const CHECK_INTERVAL_MINUTES = 1; // Cada cuánto revisar

// Configuración de Booking - AJUSTA ESTOS VALORES
const DEFAULT_PROVIDER_ID = 1; // ID del provider en tu DB
const DEFAULT_SERVICE_ID = 1;  // ID del service en tu DB

// Estado persistente (se guarda en Properties Service)
const PROPS = PropertiesService.getScriptProperties();

function main() {
  try {
    const lastSyncTime = getLastSyncTime();
    const now = new Date();
    
    // Obtener eventos modificados desde último sync
    const events = getModifiedEvents(lastSyncTime);
    
    if (events.length === 0) {
      console.log('No changes detected');
      return;
    }
    
    console.log(`Found ${events.length} modified events`);
    
    // Enviar a n8n
    events.forEach(event => {
      sendToN8N(event);
    });
    
    // Guardar timestamp de sync
    setLastSyncTime(now);
    
  } catch (error) {
    console.error('Error in main:', error.toString());
  }
}

function getLastSyncTime() {
  const timestamp = PROPS.getProperty('lastSyncTime');
  if (timestamp) {
    return new Date(parseInt(timestamp));
  }
  // Default: última hora
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  return oneHourAgo;
}

function setLastSyncTime(date) {
  PROPS.setProperty('lastSyncTime', date.getTime().toString());
}

function getModifiedEvents(sinceTime) {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  const events = calendar.getEvents(sinceTime, new Date());
  
  return events.map(event => ({
    id: event.getId(),
    title: event.getTitle(),
    start: event.getStartTime(),
    end: event.getEndTime(),
    created: event.getCreated(),
    lastUpdated: event.getLastUpdated(),
    description: event.getDescription(),
    guests: event.getGuestList().map(g => g.getEmail()),
    status: event.getEventStatus(),
    htmlLink: event.getHtmlLink()
  }));
}

function sendToN8N(event) {
  const payload = {
    source: 'google_apps_script',
    calendar_id: CALENDAR_ID,
    provider_id: DEFAULT_PROVIDER_ID,
    service_id: DEFAULT_SERVICE_ID,
    event: event,
    sync_type: 'change_detected',
    timestamp: new Date().toISOString()
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(N8N_WEBHOOK_URL, options);
  const responseCode = response.getResponseCode();
  
  if (responseCode >= 400) {
    console.error(`Failed to send to n8n: ${responseCode}`);
    console.error(response.getContentText());
  } else {
    console.log(`Sent event ${event.id} to n8n`);
  }
}

// Función de test
function testWebhook() {
  const testEvent = {
    id: 'test_' + Date.now(),
    title: 'Test Event',
    start: new Date(),
    end: new Date(Date.now() + 3600000),
    created: new Date(),
    lastUpdated: new Date(),
    description: 'Test event from Apps Script',
    guests: [],
    status: 'confirmed',
    htmlLink: 'https://calendar.google.com/'
  };
  
  sendToN8N(testEvent);
}

// Setup inicial (ejecutar una vez)
function setup() {
  console.log('Setting up Google Apps Script...');
  console.log('Calendar ID:', CALENDAR_ID);
  console.log('Webhook URL:', N8N_WEBHOOK_URL);
  
  // Verificar permisos
  try {
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    console.log('Calendar access:', calendar.getName());
  } catch (e) {
    console.error('Cannot access calendar:', e.toString());
  }
  
  // Inicializar timestamp
  if (!PROPS.getProperty('lastSyncTime')) {
    setLastSyncTime(new Date());
    console.log('Initialized lastSyncTime');
  }
  
  console.log('Setup complete!');
}
