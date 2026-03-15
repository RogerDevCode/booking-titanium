import fs from 'fs';

const WEBHOOK_URL = 'https://n8n.stax.ink/webhook/rag-ingest-document';

// Watchdog embebido
const WATCHDOG_TIMEOUT = 120000; // 2 min for 20 docs
const watchdog = setTimeout(() => {
  console.error(`\n🚨 [Watchdog] El script excedió el tiempo límite de ${WATCHDOG_TIMEOUT}ms. Terminando proceso.`);
  process.exit(1);
}, WATCHDOG_TIMEOUT);

const documents = [
  { provider_id: 1, title: "Servicio: Cardiología Avanzada", content: "Pregunta: ¿Qué servicios ofrece el área de cardiología?\nRespuesta: Ofrecemos electrocardiogramas, ecocardiogramas Doppler, ergometrías y monitoreo Holter de 24 horas. Contamos con especialistas en arritmias y prevención cardiovascular.", source_type: "service", status: "published", language: "es" },
  { provider_id: 1, title: "Servicio: Pediatría y Neonatología", content: "Pregunta: ¿Atienden niños y recién nacidos?\nRespuesta: Sí, nuestro equipo de pediatría atiende controles de salud, vacunación y consultas por enfermedad de lunes a viernes. Contamos con una sala de espera amigable para niños.", source_type: "service", status: "published", language: "es" },
  { provider_id: 1, title: "Servicio: Dermatología Clínica", content: "Pregunta: ¿Tienen especialistas en piel?\nRespuesta: Nuestra clínica ofrece servicios de dermatología para tratamiento de acné, revisión de lunares (dermatoscopia), tratamientos láser y cirugías dermatológicas menores.", source_type: "service", status: "published", language: "es" },
  { provider_id: 1, title: "Especialidad: Nutrición y Dietética", content: "Pregunta: ¿Cómo puedo mejorar mi alimentación?\nRespuesta: Ofrecemos planes alimentarios personalizados para descenso de peso, nutrición deportiva, diabetes y celiaquía con nutricionistas matriculadas.", source_type: "service", status: "published", language: "es" },
  { provider_id: 1, title: "Especialidad: Psicología y Salud Mental", content: "Pregunta: ¿Cuentan con terapia psicológica?\nRespuesta: Ofrecemos sesiones de terapia individual para adultos y adolescentes, terapia de pareja y evaluaciones psicotécnicas en un ambiente de total confidencialidad.", source_type: "service", status: "published", language: "es" },
  { provider_id: 1, title: "Política: Cancelación de Turnos", content: "Pregunta: ¿Cómo cancelo mi turno si no puedo asistir?\nRespuesta: Los turnos deben cancelarse con al menos 24 horas de antelación vía WhatsApp o por el portal del paciente para evitar cargos de inasistencia.", source_type: "policy", status: "published", language: "es" },
  { provider_id: 1, title: "Política: Turnos de Urgencia", content: "Pregunta: ¿Qué pasa si tengo una urgencia médica hoy?\nRespuesta: Si bien no somos una guardia de 24hs, reservamos cupos diarios para 'sobreturnos' de urgencia que se habilitan a las 08:00 AM cada día.", source_type: "policy", status: "published", language: "es" },
  { provider_id: 1, title: "Pago: Descuento en Efectivo", content: "Pregunta: ¿Hay algún beneficio por pagar en efectivo?\nRespuesta: Sí, ofrecemos un 10% de descuento directo en todas las consultas particulares si el pago se realiza en efectivo al momento de la atención.", source_type: "pricing", status: "published", language: "es" },
  { provider_id: 1, title: "Pago: Cuotas con Tarjeta", content: "Pregunta: ¿Puedo pagar tratamientos largos en cuotas?\nRespuesta: Sí, aceptamos tarjetas de crédito bancarizadas y ofrecemos planes de 3 y 6 cuotas con un interés mínimo para tratamientos de ortodoncia o cirugías.", source_type: "pricing", status: "published", language: "es" },
  { provider_id: 1, title: "Ubicación: Estacionamiento Cercano", content: "Pregunta: ¿Tienen estacionamiento propio?\nRespuesta: No contamos con estacionamiento propio, pero existen tres parkings comerciales en un radio de 100 metros sobre la calle Lavalle y Talcahuano.", source_type: "faq", status: "published", language: "es" },
  { provider_id: 1, title: "Ubicación: Transporte Público", content: "Pregunta: ¿Qué colectivos o subtes me dejan cerca?\nRespuesta: Puedes llegar con las líneas de colectivo 24, 26, 60, 115 y 124. También estamos a 3 cuadras de la estación 'Uruguay' de la Línea B de Subte.", source_type: "faq", status: "published", language: "es" },
  { provider_id: 1, title: "Seguros: Cobertura OSDE", content: "Pregunta: ¿Atienden pacientes de OSDE?\nRespuesta: Sí, aceptamos todos los planes de OSDE desde el 210 hasta el 510 para consultas médicas generales y todas nuestras especialidades.", source_type: "insurance", status: "published", language: "es" },
  { provider_id: 1, title: "Seguros: Cobertura Swiss Medical", content: "Pregunta: ¿Tienen convenio con Swiss Medical?\nRespuesta: Contamos con convenio directo con Swiss Medical para los planes Nubial, SMG20 y superiores. Recuerde presentar su credencial digital actualizada.", source_type: "insurance", status: "published", language: "es" },
  { provider_id: 1, title: "Telemedicina: Consultas Online", content: "Pregunta: ¿Ofrecen atención por videollamada?\nRespuesta: Sí, disponemos de un servicio de telemedicina para recetas de repetición, lectura de estudios y consultas que no requieran examen físico.", source_type: "service", status: "published", language: "es" },
  { provider_id: 1, title: "Sistema: Recordatorios de WhatsApp", content: "Pregunta: ¿Cómo me avisan de mi turno?\nRespuesta: Nuestro sistema envía un recordatorio automático por WhatsApp 48 horas antes de su cita. Debe confirmar su asistencia respondiendo 'SÍ'.", source_type: "other", status: "published", language: "es" },
  { provider_id: 1, title: "Sistema: Portal del Paciente", content: "Pregunta: ¿Dónde veo mis turnos programados?\nRespuesta: Puede acceder a sus turnos, historial médico y facturas descargando nuestra App 'Titanium Salud' o ingresando a nuestra web con su DNI.", source_type: "other", status: "published", language: "es" },
  { provider_id: 1, title: "Laboratorio: Entrega de Resultados", content: "Pregunta: ¿Cuánto tardan los análisis de sangre?\nRespuesta: Los resultados de laboratorio de rutina están listos en 24-48 horas hábiles. Se envían automáticamente a su correo electrónico registrado.", source_type: "service", status: "published", language: "es" },
  { provider_id: 1, title: "Vacunatorio: Horarios y Stock", content: "Pregunta: ¿Cuándo puedo ir a vacunarme?\nRespuesta: El vacunatorio funciona de lunes a viernes de 10:00 a 18:00 sin turno previo para vacunas del calendario oficial. Sujeto a disponibilidad de stock.", source_type: "schedule", status: "published", language: "es" },
  { provider_id: 1, title: "FAQ: Requisitos para Viajeros", content: "Pregunta: ¿Hacen certificados para viajes internacionales?\nRespuesta: Sí, realizamos chequeos apto físico y certificados de salud requeridos para viajes, incluyendo validación de esquemas de vacunación específicos.", source_type: "faq", status: "published", language: "es" },
  { provider_id: 1, title: "Soporte: Atención al Cliente", content: "Pregunta: ¿En qué horario responden consultas administrativas?\nRespuesta: Nuestro equipo administrativo atiende consultas por teléfono y WhatsApp de lunes a viernes de 09:00 a 19:00 y sábados de 09:00 a 12:00.", source_type: "schedule", status: "published", language: "es" }
];

async function runBatchIngestion() {
  console.log(`Iniciando ingesta masiva de ${documents.length} documentos informativos...\\n`);
  
  let successCount = 0;
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc)
      });
      const result = await response.json() as any;
      if (response.ok && result.success) {
        console.log(`[${i+1}/20] ✅ "${doc.title}" subido.`);
        successCount++;
      } else {
        console.error(`[${i+1}/20] ❌ Error en "${doc.title}":`, result.error_message);
      }
    } catch (e: any) {
      console.error(`[${i+1}/20] ❌ Excepción:`, e.message);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\nInyectados: ${successCount}/20`);
  clearTimeout(watchdog);
}

runBatchIngestion();
