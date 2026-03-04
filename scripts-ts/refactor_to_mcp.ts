import * as fs from 'fs';
import * as path from 'path';

const WORKFLOWS_DIR = path.resolve(__dirname, '../workflows');

const toolsMapping: Record<string, any> = {
  'DB_Find_Next_Available.json': {
    description: 'Encuentra el próximo slot/hora disponible para una reserva a partir de una fecha especificada. Output incluye los próximos turnos disponibles.',
    schema: [
      { name: 'date', type: 'string', description: 'Fecha objetivo en formato YYYY-MM-DD' }
    ]
  },
  'DB_Create_Booking.json': {
    description: 'Crea una reserva en la base de datos de PostgreSQL con la informacion del cliente.',
    schema: [
      { name: 'chat_id', type: 'number', description: 'ID de Telegram del cliente' },
      { name: 'start_time', type: 'string', description: 'Fecha y hora de inicio de la reserva en formato ISO 8601' },
      { name: 'user_email', type: 'string', description: 'Correo del cliente' },
      { name: 'user_name', type: 'string', description: 'Nombre completo del cliente' },
      { name: 'provider_id', type: 'number', description: 'ID del proveedor (por defecto 1)' },
      { name: 'service_id', type: 'number', description: 'ID del servicio (por defecto 1)' }
    ]
  },
  'DB_Get_Availability.json': {
    description: 'Obtiene todos los slots disponibles para una fecha específica.',
    schema: [
      { name: 'date', type: 'string', description: 'Fecha objetivo en formato YYYY-MM-DD' }
    ]
  },
  'DB_Reschedule_Booking.json': {
    description: 'Reprograma una reserva existente a una nueva fecha y hora.',
    schema: [
      { name: 'booking_id', type: 'string', description: 'UUID de la reserva a reprogramar' },
      { name: 'new_start_time', type: 'string', description: 'Nueva fecha y hora en formato ISO 8601' }
    ]
  },
  'DB_Cancel_Booking.json': {
    description: 'Cancela una reserva existente.',
    schema: [
      { name: 'booking_id', type: 'string', description: 'UUID de la reserva a cancelar' }
    ]
  },
  'GCAL_Create_Event.json': {
    description: 'Crea un evento en Google Calendar para una reserva confirmada.',
    schema: [
      { name: 'summary', type: 'string', description: 'Título del evento en el calendario' },
      { name: 'start_time', type: 'string', description: 'Fecha y hora de inicio en ISO 8601' },
      { name: 'end_time', type: 'string', description: 'Fecha y hora de fin en ISO 8601' },
      { name: 'user_email', type: 'string', description: 'Correo del cliente para enviarle la invitación' },
      { name: 'description', type: 'string', description: 'Información adicional de la reserva' }
    ]
  },
  'GCAL_Delete_Event.json': {
    description: 'Elimina un evento previamente agendado de Google Calendar.',
    schema: [
      { name: 'event_id', type: 'string', description: 'ID del evento de Google Calendar' }
    ]
  }
};

function processWorkflows() {
  for (const [filename, config] of Object.entries(toolsMapping)) {
    const filePath = path.join(WORKFLOWS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Configurar workflow settings para descripción (crucial para que el LLM entienda qué hace la herramienta)
    if (!data.settings) data.settings = {};
    // La descripción de MCP proviene generalmente del nodo Call Workflow o de los settings
    data.settings.description = config.description;

    // Buscar Execute Workflow Trigger
    const trigger = data.nodes.find((n: any) => n.type === 'n8n-nodes-base.executeWorkflowTrigger');
    if (trigger) {
      trigger.parameters.inputSource = 'schema';
      trigger.parameters.schema = config.schema.map((field: any) => ({
        name: field.name,
        type: field.type,
        description: field.description
      }));
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`✅ Updated ${filename} for MCP Toolbox compatibility.`);
  }
}

processWorkflows();
