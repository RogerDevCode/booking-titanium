/**
 * Google Apps Script para notificar cambios de Calendar a n8n
 * 
 * Soporta MÚLTIPLES calendarios con diferentes provider_id y service_id
 * 
 * Instrucciones:
 * 1. Configurar CALENDAR_CONFIGS con tus calendarios
 * 2. Ir a https://script.google.com/
 * 3. Crear nuevo proyecto y pegar este código
 * 4. Configurar trigger de tiempo (cada 1-5 minutos)
 * 5. Ejecutar setup() una vez
 * 
 * Alternativa con Google Calendar Push Notifications:
 * https://developers.google.com/calendar/api/guides/push
 * Requiere Google Cloud Console y verificación de dominio
 */

// ============================================================================
// CONFIGURACIÓN - EDITA ESTA SECCIÓN
// ============================================================================

const N8N_WEBHOOK_URL = 'https://n8n.stax.ink/webhook/gcal-sync-trigger';

// Lista de calendarios a monitorear
// Agrega un objeto por cada calendario que quieras sincronizar
const CALENDAR_CONFIGS = [
  {
    calendar_id: 'dev.n8n.stax@gmail.com',
    provider_id: 1,
    service_id: 1,
    activo: true
  },
  // Agrega más calendarios aquí:
  // {
  //   calendar_id: 'ventas@tuempresa.com',
  //   provider_id: 2,
  //   service_id: 3,
  //   activo: true
  // },
  // {
  //   calendar_id: 'soporte@tuempresa.com',
  //   provider_id: 3,
  //   service_id: 5,
  //   activo: false  // Desactivado temporalmente
  // }
];

const CHECK_INTERVAL_MINUTES = 1; // Cada cuánto revisar (mínimo 1)

// ============================================================================
// ESTADO PERSISTENTE (no editar)
// ============================================================================

const PROPS = PropertiesService.getScriptProperties();

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

function main() {
  try {
    const configs = CALENDAR_CONFIGS.filter(c => c.activo !== false);
    
    if (configs.length === 0) {
      console.error('No hay calendarios activos configurados');
      return;
    }
    
    console.log(`Procesando ${configs.length} calendario(s)...`);
    
    for (const config of configs) {
      try {
        processCalendar(config);
      } catch (error) {
        console.error(`Error procesando ${config.calendar_id}: ${error.toString()}`);
      }
    }
    
  } catch (error) {
    console.error('Error en main:', error.toString());
  }
}

// ============================================================================
// PROCESAR CALENDARIO INDIVIDUAL
// ============================================================================

function processCalendar(config) {
  const lastSyncTime = getLastSyncTime(config.calendar_id);
  const now = new Date();
  
  console.log(`[${config.calendar_id}] Buscando cambios desde ${lastSyncTime.toISOString()}...`);
  
  // Obtener eventos modificados desde último sync
  const events = getModifiedEvents(config.calendar_id, lastSyncTime);
  
  if (events.length === 0) {
    console.log(`[${config.calendar_id}] Sin cambios`);
    return;
  }
  
  console.log(`[${config.calendar_id}] Encontrados ${events.length} evento(s) modificado(s)`);
  
  // Enviar a n8n
  let successCount = 0;
  events.forEach(event => {
    const success = sendToN8N(event, config);
    if (success) successCount++;
  });
  
  // Guardar timestamp de sync
  setLastSyncTime(config.calendar_id, now);
  
  console.log(`[${config.calendar_id}] Sync completado: ${successCount}/${events.length} evento(s) enviado(s)`);
}

// ============================================================================
// FUNCIONES DE ESTADO
// ============================================================================

function getLastSyncTime(calendarId) {
  const safeName = calendarId.replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = PROPS.getProperty(`lastSyncTime_${safeName}`);
  
  if (timestamp) {
    return new Date(parseInt(timestamp));
  }
  
  // Default: última hora
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  return oneHourAgo;
}

function setLastSyncTime(calendarId, date) {
  const safeName = calendarId.replace(/[^a-zA-Z0-9]/g, '_');
  PROPS.setProperty(`lastSyncTime_${safeName}`, date.getTime().toString());
}

// ============================================================================
// OBTENER EVENTOS
// ============================================================================

function getModifiedEvents(calendarId, sinceTime) {
  const calendar = CalendarApp.getCalendarById(calendarId);
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

// ============================================================================
// ENVIAR A N8N
// ============================================================================

function sendToN8N(event, config) {
  const payload = {
    source: 'google_apps_script',
    calendar_id: config.calendar_id,
    provider_id: config.provider_id,
    service_id: config.service_id,
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
  
  try {
    const response = UrlFetchApp.fetch(N8N_WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode >= 400) {
      console.error(`[${config.calendar_id}] Error enviando evento ${event.id}: ${responseCode}`);
      console.error(response.getContentText());
      return false;
    } else {
      console.log(`[${config.calendar_id}] Evento ${event.id} enviado a n8n`);
      return true;
    }
  } catch (error) {
    console.error(`[${config.calendar_id}] Error enviando evento: ${error.toString()}`);
    return false;
  }
}

// ============================================================================
// FUNCIONES DE SETUP Y TEST
// ============================================================================

// Setup inicial (ejecutar una vez)
function setup() {
  console.log('=== Google Apps Script Setup ===');
  console.log('Webhook URL:', N8N_WEBHOOK_URL);
  console.log('Calendarios configurados:', CALENDAR_CONFIGS.length);
  
  const activos = CALENDAR_CONFIGS.filter(c => c.activo !== false);
  console.log('Calendarios activos:', activos.length);
  
  activos.forEach(c => {
    console.log(`  - ${c.calendar_id} (provider=${c.provider_id}, service=${c.service_id})`);
  });
  
  // Verificar permisos
  console.log('\nVerificando acceso a calendarios...');
  activos.forEach(config => {
    try {
      const calendar = CalendarApp.getCalendarById(config.calendar_id);
      console.log(`  ✅ ${config.calendar_id}: ${calendar.getName()}`);
    } catch (e) {
      console.error(`  ❌ ${config.calendar_id}: ${e.toString()}`);
    }
  });
  
  // Inicializar timestamps
  console.log('\nInicializando timestamps...');
  activos.forEach(config => {
    const safeName = config.calendar_id.replace(/[^a-zA-Z0-9]/g, '_');
    if (!PROPS.getProperty(`lastSyncTime_${safeName}`)) {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      setLastSyncTime(config.calendar_id, oneHourAgo);
      console.log(`  ✅ ${config.calendar_id}: lastSyncTime inicializado`);
    } else {
      console.log(`  ℹ️  ${config.calendar_id}: lastSyncTime ya existe`);
    }
  });
  
  console.log('\n=== Setup completado ===');
}

// Función de test
function testWebhook() {
  console.log('=== Test Webhook ===');
  
  const config = CALENDAR_CONFIGS[0];
  if (!config) {
    console.error('No hay calendarios configurados');
    return;
  }
  
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
  
  console.log('Enviando evento de prueba...');
  const success = sendToN8N(testEvent, config);
  
  if (success) {
    console.log('✅ Test exitoso');
  } else {
    console.error('❌ Test fallido');
  }
}

// Listar eventos recientes (para debug)
function listRecentEvents() {
  console.log('=== Eventos Recientes ===');
  
  const configs = CALENDAR_CONFIGS.filter(c => c.activo !== false);
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);
  
  configs.forEach(config => {
    console.log(`\nCalendario: ${config.calendar_id}`);
    
    try {
      const calendar = CalendarApp.getCalendarById(config.calendar_id);
      const events = calendar.getEvents(oneHourAgo, new Date());
      
      if (events.length === 0) {
        console.log('  Sin eventos en la última hora');
      } else {
        events.forEach(e => {
          console.log(`  - ${e.getTitle()} (${e.getStartTime().toISOString()})`);
        });
      }
    } catch (e) {
      console.error(`  Error: ${e.toString()}`);
    }
  });
}
