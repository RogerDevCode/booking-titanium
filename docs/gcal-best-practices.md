gcal-best-practices.md
======================

# Manual: Uso, configuración, mejores prácticas y debug de Google Calendar en workflows n8n

## 1. Resumen ejecutivo

Este manual sintetiza el uso del nodo Google Calendar y del Google Calendar Trigger en n8n, junto con patrones de diseño, configuración y debugging basados en la documentación oficial, issues de GitHub y discusiones de la comunidad. Se cubren:

- Operaciones soportadas por el nodo Google Calendar (Event y Calendar) y consideraciones prácticas (zonas horarias, recurrencias, actualizaciones)【turn10fetch0】【turn13fetch0】【turn16fetch0】【turn17fetch0】.
- Patrones de diseño de workflows (modularidad, idempotencia, manejo de errores) inspirados en mejores prácticas de orquestación de workflows【turn3fetch0】.
- Flujos de debugging en la UI de n8n y uso de la API pública y el nodo n8n para inspeccionar y reintentar ejecuciones【turn22fetch0】【turn47fetch0】【turn51fetch0】.
- Bugs y limitaciones conocidas del nodo Google Calendar (UI congelada en Update, errores 403, problemas de timezone y recurrencia)【turn35search0】【turn36fetch1】【turn36fetch2】【turn36fetch3】.

El foco es ofrecer reglas prácticas y patrones concretos para construir workflows robustos con Google Calendar en n8n.

---

## 2. Ámbito y objetivos

**Objetivo del manual**

Servir como referencia interna para un LLM que deba:

- Diseñar y configurar workflows n8n que usen Google Calendar.
- Aplicar mejores prácticas de diseño, seguridad y observabilidad.
- Realizar debugging sistemático usando UI, API y logs.

**Alcance**

- Nodo **Google Calendar** (app node) y nodo **Google Calendar Trigger**【turn10fetch0】【turn39fetch0】.
- Configuración de credenciales OAuth2 de Google y consideraciones multi-tenant.
- Patrones de diseño de workflows en n8n, con énfasis en:
  - Modularidad y subworkflows.
  - Manejo de errores y reintentos.
  - Idempotencia y detección de duplicados.
- Debugging:
  - UI de ejecuciones (Debug in editor, Copy to editor)【turn22fetch0】.
  - API REST pública y nodo **n8n** para leer/reintentar ejecuciones【turn47fetch0】【turn51fetch0】.
- Bugs y limitaciones documentados en GitHub y comunidad.

---

## 3. Fundamentos de Google Calendar en n8n

### 3.1 Nodo Google Calendar

**Ubicación oficial**

- Docs: Google Calendar node【turn10fetch0】.
- Event operations: Create, Delete, Get, Get Many, Update【turn16fetch0】【turn17fetch0】.
- Calendar operations: Availability (freebusy)【turn13fetch0】.

**Operaciones principales**

- **Calendar → Availability**:
  - Comprueba si un rango horario está disponible en un calendario.
  - Parámetros: calendario, start/end time, timezone, output format (Availability / Booked Slots / RAW)【turn13fetch0】.
  - Internamente usa la API Freebusy de Google Calendar【turn13fetch0】.

- **Event → Create**:
  - Añade un evento a un calendario.
  - Parámetros clave: calendario, start/end time, all day, attendees, description, location, summary, reminders, recurrence (RRULE/Repeat Frequency), send updates, etc.【turn16fetch0】.

- **Event → Get / Get Many**:
  - `Get`: un evento por ID.
  - `Get Many`: muchos eventos con filtros (After, Before, Query, Recurring Event Handling, etc.)【turn17fetch0】.

- **Event → Update**:
  - Actualiza un evento existente. Permite modificar campos puntuales (summary, description, times, attendees, etc.)【turn17fetch0】.
  - Importante: actualizar solo los campos necesarios para minimizar riesgo de errores y problemas de UI.

- **Event → Delete**:
  - Borra un evento por ID【turn16fetch0】.

**Uso como herramienta de IA**

- El nodo Google Calendar puede usarse como **tool** dentro de un AI Agent para permitir que un LLM gestione eventos directamente. Esto añade complejidad y ciertos bugs de UI (ver sección 6)【turn10fetch0】.

---

### 3.2 Google Calendar Trigger node

**Ubicación oficial**

- Docs: Google Calendar Trigger node【turn39fetch0】.

**Eventos soportados**

- Event Cancelled, Event Created, Event Ended, Event Started, Event Updated【turn39fetch0】.

**Consideraciones prácticas**

- Es un **trigger** que se ejecuta cuando se producen cambios en el calendario.
- La latencia depende del mecanismo de polling/webhooks de Google; no siempre es instantáneo.
- Para eventos recurrentes, asegurar que el tratamiento de instancias vs serie es coherente con el uso posterior del nodo Google Calendar.

---

## 4. Patrones de diseño y mejores prácticas

### 4.1 Principios generales de diseño de workflows

Basado en mejores prácticas de orquestación de workflows【turn3fetch0】 y documentación de n8n:

1. **Diseñar como DAGs (flujos acíclicos)**  
   - Evitar ciclos; cada tarea debe ejecutarse como máximo una vez por ejecución.
   - n8n ya estructura los workflows como DAGs; respetar ese modelo.

2. **Modularidad y subworkflows**
   - Separar lógica de negocio grande en **subworkflows** (por ejemplo, “sincronizar calendario” vs “enviar recordatorios”).
   - Facilita testing, reutilización y aislamiento de fallos【turn3fetch0】.

3. **Idempotencia**
   - Los nodos que crean eventos deben ser **idempotentes**:
     - Usar `Get Many` + filtros para evitar duplicados.
     - Usar `Update` en lugar de múltiples `Create` cuando sea posible.
   - Esto es crucial para reintentos y re-ejecuciones seguras【turn3fetch0】.

4. **Manejo explícito de errores y reintentos**
   - Configurar **Continue On Error** solo en nodos donde tenga sentido.
   - Implementar **error workflows** globales (ver sección 5.1).
   - Añadir lógica de reintentos con backoff para operaciones contra Google Calendar.

5. **Observabilidad**
   - Añadir nombres descriptivos a nodos y sticky notes explicativas.
   - Usar tags y nombres de workflow claros.
   - Mantener logs externos de ejecuciones críticas (ver sección 5.3).

---

### 4.2 Patrones específicos con Google Calendar

#### 4.2.1 Creación de eventos

**Reglas recomendadas**

1. **Normalizar fechas y zonas horarias**
   - Usar siempre objetos `DateTime` con timezone explícita.
   - No confiar únicamente en la configuración global de n8n; tests previos han mostrado inconsistencias de timezone en el nodo Google Calendar【turn36fetch2】.
   - Ver sección 6.1 para detalles del bug y workaround.

2. **Evitar eventos duplicados**
   - Antes de crear un evento, usar `Get Many` con:
     - Rango de tiempo apropiado.
     - Filtros por `summary` u otros campos relevantes.
   - Si el evento ya existe, decidir:
     - Actualizar (`Update`) si corresponde.
     - Omitir la creación.

3. **Manejar asistentes y Meet links con cuidado**
   - `Conference Data` permite generar enlaces de Meet/Hangouts【turn16fetch0】.
   - `Send Updates` controla si se envían notificaciones a asistentes; usar con cuidado para evitar spam.

4. **Recurrencia**
   - Usar `RRULE` solo si es estrictamente necesario; la complejidad incrementa el riesgo de errores.
   - Ver sección 6.3 para problemas conocidos con eventos recurrentes.

#### 4.2.2 Disponibilidad (Availability)

**Uso típico**

- Comprobar disponibilidad antes de proponer huecos de reunión.
- Usar `Output Format`:
  - `Availability`: devuelve booleano simple.
  - `Booked Slots`: para mostrar los huecos ocupados.
  - `RAW`: para depuración avanzada【turn13fetch0】.

**Buenas prácticas**

- Limitar el rango temporal a lo estrictamente necesario.
- Ajustar `Timezone` al del usuario final, no al del servidor.
- Considerar que la API Freebusy tiene cuotas y latencias.

#### 4.2.3 Actualización de eventos

**Riesgos y mitigaciones**

1. **UI congelada en Update con AI Tools**  
   - Varios issues reportan que el UI se congela al usar “Let the model define this parameter” en Event ID del Google Calendar Tool (Update)【turn35search0】【turn35search6】【turn35search9】.
   - Workaround:
     - Usar **Event ID fijo** o expresión manual, no “Let the model define”.
     - O usar el nodo Google Calendar normal, no como Tool de AI Agent.

2. **Errores 403 al guardar**
   - Issue #20781 muestra errores 403 y problemas de `ProjectId` al guardar el nodo Google Calendar Update【turn36fetch1】.
   - Revisar:
     - Permisos del proyecto Google Cloud.
     - Orígenes permitidos y redirect URIs de OAuth.
     - Que el calendario sea accesible por la cuenta de servicio o usuario OAuth.

3. **Actualizar solo campos necesarios**
   - Usar `Update Fields` en lugar de reenviar todo el objeto de evento.
   - Esto reduce riesgo de sobrescribir datos y de errores por campos no permitidos.

---

## 5. Debug y observabilidad en n8n

### 5.1 Debugging en la UI

#### 5.1.1 Debug and re-run past executions

**Funcionalidad oficial**

- La página “Debug and re-run past executions” permite cargar datos de una ejecución anterior en el editor de workflows【turn22fetch0】.
- Pasos:
  1. En el workflow, ir a la pestaña **Executions**.
  2. Seleccionar la ejecución a depurar.
  3. Para ejecuciones fallidas: **Debug in editor**.
  4. Para exitosas: **Copy to editor**.
  5. n8n copia los datos de ejecución al primer nodo y los “pega” (pins) para poder re-ejecutar【turn22fetch0】.

**Uso práctico**

- Reproducir fallos de producción sin modificar el workflow activo.
- Probar cambios en un nodo específico manteniendo el input original.
- Verificar que un fix efectivamente resuelve el error.

#### 5.1.2 Executions list y filtros

- Ver todas las ejecuciones desde **Overview → Executions** o dentro de cada workflow【turn48search0】.
- Filtrar por:
  - Estado (Error / Success / Waiting / Running / Canceled)【turn47fetch0】.
  - Workflow, tiempo, etc.
- Esto permite identificar patrones de fallo (por ejemplo, errores recurrentes en Google Calendar).

---

### 5.2 Uso de la API pública de n8n para debug

#### 5.2.1 Visión general

- n8n expone una **REST API pública** que permite realizar muchas de las mismas tareas que en la UI【turn41fetch0】.
- La API está deshabilitada en el trial; requiere plan de pago o self-hosted con la API habilitada【turn25fetch0】.
- Se recomienda deshabilitar la API si no se usa, por seguridad【turn24search1】.

#### 5.2.2 Operaciones relevantes

- **GET /executions** y **GET /executions/{id}**:
  - Permiten listar y obtener detalles de ejecuciones【turn47fetch0】.
  - El nodo **n8n** expone operaciones `Get execution` y `Get many executions` con filtros por workflow y status【turn47fetch0】.

- **Retry execution endpoint**:
  - A partir de versiones 1.x, existen endpoints públicos para reintentar ejecuciones fallidas【turn51fetch0】.
  - Útil para automatizar reintentos masivos o selectivos.

**Ejemplo de uso (conceptual)**

1. Obtener ejecuciones con error de un workflow:
   - Usar `Get many executions` con filtros:
     - Workflow: ID del workflow.
     - Status: `Error`.
     - `Include Execution Details`: ON.

2. Inspeccionar datos:
   - Revisar `execution.error.message`, `lastNodeExecuted`, inputs/outputs de nodos.

3. Reintentar ejecuciones:
   - Llamar al endpoint de retry de la API o usar el nodo n8n correspondiente.

---

### 5.3 Uso del nodo n8n para auto-debug y auditoría

El nodo **n8n** permite acceder a la API pública desde dentro de un workflow【turn47fetch0】:

- **Get execution**:
  - Dado un `Execution ID`, recupera detalles de esa ejecución.
  - Opción `Include Execution Details` para obtener datos de cada nodo.

- **Get many executions**:
  - Filtrar por workflow y status (Error, Success, Waiting)【turn47fetch0】.
  - Útil para construir dashboards de errores, auditorías o flujos de auto-reintento.

**Patrón típico de auditoría**

1. Workflow programado (por ejemplo, cada hora) que:
   - Usa `Get many executions` para listar ejecuciones con error de los últimos N minutos.
   - Envía un resumen a Slack/Email.
   - Opcionalmente, reintentar automáticamente las ejecuciones fallidas.

---

### 5.4 Logs y configuración de log level

- Para debugging detallado, se recomienda:
  - Aumentar el nivel de log a `debug` (por ejemplo, `N8N_LOG_LEVEL=debug` en self-hosted).
  - Revisar logs del servidor para ver tiempos de ejecución, errores de HTTP, timeouts, etc.
- La comunidad recomienda habilitar log streaming o integrar con sistemas de logging externos para producción【turn32fetch0】.

---

## 6. Bugs y limitaciones conocidas

### 6.1 Timezone ignorado al crear eventos

- **Issue #14411**: el nodo Google Calendar puede ignorar la zona horaria proporcionada y crear eventos en `America/New_York` aunque se especifique otra timezone【turn36fetch2】.
- El reporte indica que esto ocurre incluso cuando:
  - `start.dateTime` y `end.dateTime` incluyen offset.
  - Se proporciona `timeZone` explícitamente.
  - `TZ` está configurado en el contenedor.

**Workaround sugerido**

- Como workaround, usar un **HTTP node** directamente contra la API de Google Calendar, donde se controla completamente el payload JSON【turn36fetch2】.
- En la práctica, esto implica:
  - Autenticar con OAuth2 de Google (HTTP node).
  - Construir manualmente el cuerpo del evento con timezone correcta.
  - Usar el endpoint `Events: insert` de Google Calendar.

---

### 6.2 Problemas de UI en Google Calendar Tool (AI Agent)

Varios issues reportan problemas al usar el nodo Google Calendar como **Tool** dentro de un AI Agent:

- **#21340 / #20781**: el nodo se congela al usar “Update Event” en ciertas condiciones, especialmente al definir el Event ID con “Let the model define this parameter”【turn35search0】【turn36fetch1】.
- **#20848**: UI se congela al seleccionar “Let the model define this parameter” en Event ID para Update【turn35search6】.
- **#21030**: Google Calendar Tool → Update Event → opción “let the model define the Event ID” hace que el nodo se vuelva no responsivo【turn35search9】.

**Recomendaciones**

- Evitar usar “Let the model define this parameter” para Event ID en Update.
- Preferir:
  - IDs fijos.
  - Expresiones manuales (por ejemplo, extraer ID de un nodo anterior).
- Si se necesita AI Agent:
  - Mantener el nodo Google Calendar como nodo normal, no como Tool, cuando sea posible.

---

### 6.3 Problemas con eventos recurrentes

- **Issue #8655**: errores al recuperar múltiples eventos con recurrencia, por ejemplo:
  - `ERROR: Unsupported RFC prop RDATE in RDATE;TZID=Europe/Paris:20210405T093000`【turn36fetch3】.
- Esto indica que el nodo no maneja completamente todas las propiedades RFC de recurrencia.

**Recomendaciones**

- Limitar el uso de patrones de recurrencia complejos.
- Si se necesitan recurrencias avanzadas:
  - Considerar usar la API de Google Calendar directamente via HTTP node.
  - O gestionar la recurrencia a nivel de aplicación (por ejemplo, generar múltiples eventos simples).

---

### 6.4 Otros problemas menores

- Problemas con la opción **All Day** en ciertas versiones (creaba eventos todo el día incorrectamente)【turn35search4】.
- Errores 403 al cargar el nodo Update (ver sección 4.2.3).
- Latencia y falta de robustez en triggers de Google Calendar reportados por la comunidad【turn35search18】.

---

## 7. Patrones de manejo de errores

### 7.1 Error workflows en n8n

n8n permite configurar **error workflows** que se ejecutan cuando un workflow falla【turn32fetch0】:

1. Crear un workflow que empiece con **Error Trigger**.
2. En el workflow principal, ir a **Options → Settings** y seleccionar ese workflow como **Error workflow**.
3. Cuando el workflow principal falle, el error workflow recibirá un objeto con:

   ```json
   {
     "execution": {
       "id": "231",
       "url": "https://n8n.example.com/execution/231",
       "error": { "message": "...", "stack": "..." },
       "lastNodeExecuted": "Node With Error",
       "mode": "manual"
     },
     "workflow": { "id": "1", "name": "Example Workflow" }
   }
   
   Uso recomendado 

     Enviar alertas (Slack, email, PagerDuty) cuando falle un workflow crítico de Google Calendar.
     Registrar errores en una base de datos externa para análisis.
     
7.2 Stop And Error 

     El nodo Stop And Error permite forzar un error en el workflow, lo que activa el error workflow configurado.
     Útil para:
         Validar condiciones de negocio (por ejemplo, “no se pudo encontrar evento”).
         Implementar lógica de fallo controlado.
             
8. Seguridad y credenciales 
8.1 Gestión de credenciales Google 

     Usar el credential manager de n8n para almacenar OAuth2 de Google Calendar.
     Para multi-tenant:
         Comunidad discute “dynamic credentials” y per-user OAuth para Google nodes  .
         Revisar las opciones de “Full Service Account / DWD Support for Google Calendar Node”  .
         
Recomendaciones 

     No incrustar tokens o refresh tokens directamente en nodos Code.
     Rotar credenciales periódicamente.
     Revisar permisos de la cuenta de servicio o usuario OAuth:
         calendar.events, calendar.readonly, etc.
         
9. Recomendaciones de implementación 
9.1 Checklist de diseño de workflows con Google Calendar 

    Definir objetivo y flujo de datos 
         ¿Qué eventos se crean/actualizan/borran?
         ¿De dónde viene el input (webhook, otro sistema, AI Agent)?
          
    Modelar como DAG 
         Identificar ramas paralelas y puntos de decisión.
         Evitar dependencias circulares.
          
    Diseñar nodos Google Calendar 
         Elegir operaciones correctas (Create vs Update vs Get Many).
         Normalizar fechas y zonas horarias.
         Planificar manejo de duplicados y recurrencia.
          
    Implementar manejo de errores 
         Configurar error workflow.
         Añadir nodos de validación y Stop And Error donde proceda.
          
    Añadir observabilidad 
         Nombres claros, sticky notes.
         Tags y descripción del workflow.
         Logs externos si es necesario.
          
9.2 Checklist de debug ante fallos 

    Abrir la pestaña Executions del workflow. 
    Filtrar por status Error y rango temporal. 
    Seleccionar una ejecución y usar Debug in editor. 
    Revisar:
         execution.error.message y lastNodeExecuted.
         Inputs/outputs de nodos Google Calendar.
          
    Probar fixes en el editor:
         Ajustar fechas, IDs, operaciones.
         Re-ejecutar con los datos de la ejecución fallida.
          
    Si el error persiste:
         Revisar logs del servidor.
         Buscar el mensaje de error en issues de GitHub y foro de la comunidad.
          
10. Gaps y limitaciones de la investigación 

Qué se buscó y no se encontró (con fuentes consultadas) 

    Endpoint público documentado para ejecutar un workflow por ID sin webhook 
         Buscado en:
             Docs de la API pública.
             Blog “Introducing the n8n public API”.
             Hilo de comunidad “Executing a workflow via API call (without webhook or CLI)”.
             
         Conclusión: no existe endpoint público documentado para ejecutar un workflow directamente por su ID; solo vía webhook o CLI.
          
    Detalles internos de implementación del nodo Google Calendar 
         Buscado en:
             Código fuente en GitHub (Google Calendar node)  .
             
         No se realizó revisión profunda del código por limitaciones de tiempo; se priorizaron docs oficiales y issues.
          
    Estudios académicos específicos sobre n8n 
         Buscado en arXiv, Google Scholar, Semantic Scholar:
             No se encontraron papers de alto impacto directamente sobre n8n.
             Se usaron papers genéricos de diseño de workflows y orquestación.
                       
    Métricas cuantitativas de rendimiento del nodo Google Calendar 
         No se encontraron benchmarks formales; las recomendaciones se basan en experiencia de comunidad y mejores prácticas generales.
          
11. Auto-audit del reporte 

    Fuentes Tier 1 encontradas 
         Documentación oficial de n8n (Google Calendar node, Event operations, Calendar operations, Trigger node, Debug executions, Error handling, API reference).
         Repositorio oficial de n8n en GitHub (issues y código).
         Blog oficial de n8n (introducción a la API pública).
          
    Qué se buscó y no se encontró 
         Endpoint público para ejecutar workflows por ID sin webhook.
         Papers académicos específicos sobre n8n.
         Benchmarks cuantitativos del nodo Google Calendar.
          
    Afirmaciones sin fuente explícita 
         Algunas recomendaciones de diseño (por ejemplo, usar backoff exponencial para reintentos) son buenas prácticas generales de APIs y no están específicamente documentadas para Google Calendar en n8n. Se han marcado implícitamente como [SIN FUENTE] en el contexto estricto de n8n.
          
    Contradicciones sin resolver 
         No se encontraron contradicciones significativas entre fuentes oficiales. Los problemas reportados en issues (por ejemplo, timezone ignorado) no contradicen la documentación, sino que indican bugs o comportamientos no deseados.
          
    Nivel de confianza general 
         Alto (≈ 85%):
             Alta confianza en la estructura y operaciones del nodo Google Calendar (docs oficiales).
             Alta confianza en mecanismos de debug y API (docs oficiales + comunidad).
             Confianza media–alta en recomendaciones de diseño, derivadas de docs generales de orquestación y experiencia comunitaria, no de papers peer-reviewed específicos de n8n.
                       
12. Lista completa de fuentes con tier asignado 
Tier 1 — Autoritativas 

    Google Calendar node documentation – n8n Docs
    https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar  
     
    Google Calendar Event operations – n8n Docs
    https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/event-operations  
     
    Google Calendar Calendar operations (Availability) – n8n Docs
    https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlecalendar/calendar-operations  
     
    Google Calendar Trigger node documentation – n8n Docs
    https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googlecalendartrigger  
     
    Debug and re-run past executions – n8n Docs
    https://docs.n8n.io/workflows/executions/debug  
     
    Error handling – n8n Docs
    https://docs.n8n.io/flow-logic/error-handling  
     
    n8n public REST API Documentation and Guides – n8n Docs
    https://docs.n8n.io/api  
     
    API reference | n8n Docs
    https://docs.n8n.io/api/api-reference  
     
    Operations (n8n node – Get execution / Get many executions) – n8n Docs
    https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.n8n  
     
    Release notes pre 2.0 – Retry execution endpoint – n8n Docs
    https://docs.n8n.io/release-notes/1-x  
     
    Introducing the n8n public API – Blog n8n
    https://blog.n8n.io/introducing-the-n8n-public-api  
     
Tier 1 — Repos oficiales + issues 

    n8n-io/n8n GitHub organization
    https://github.com/n8n-io  
     
    BUG with the node of google calendar #21340  
    https://github.com/n8n-io/n8n/issues/21340  
     
    Google Calendar Update Node UI Fails to Load or Save (403 & TypeError) #20781
    https://github.com/n8n-io/n8n/issues/20781  
     
    Bug: Google Calendar node ignores timeZone even when explicitly provided #14411
    https://github.com/n8n-io/n8n/issues/14411  
     
    Problem with the Google Calendar node for obtaining multiple events with recurrence #8655
    https://github.com/n8n-io/n8n/issues/8655  
     
Tier 2 — Alta confianza 

    “Introduction to Data Engineering Concepts | Scheduling and Workflow Orchestration” – DEV Community (artículo técnico con mejores prácticas de diseño de workflows)
    https://dev.to/alexmercedcoder/introduction-to-data-engineering-concepts-12-scheduling-and-workflow-orchestration-6j2  
     
    “The (R)evolution of Scientific Workflows in the Agentic AI Era” – arXiv (patrones de diseño de workflows científicos)
    https://arxiv.org/html/2509.09915v1  
     
Tier 3 — Suplementario 

    Api access to execution log – n8n Community
    https://community.n8n.io/t/api-access-to-execution-log/20136  
     

    Executing a workflow via API call (without webhook or CLI) – n8n Community
    https://community.n8n.io/t/executing-a-workflow-via-api-call-without-webhook-or-cli-command/212895  
     

    Google Calendar node malfunction – n8n Community  
    https://community.n8n.io/t/google-calendar-node-malfunction/190466  
     

    AI Agent - Google Calendar Tool is failing – n8n Community  
    https://community.n8n.io/t/ai-agent-google-calendar-tool-is-failing/208748  
     

    Timezone Issue When Creating Google Calendar Events – n8n Community  
    https://community.n8n.io/t/timezone-issue-when-creating-google-calendar-events/92828  
     

    Google Calendar Update Event succeeds but no changes are applied – n8n Community  
    https://community.n8n.io/t/google-calendar-update-event-succeeds-but-no-changes-are-applied-n8n-ai-agent/236634
