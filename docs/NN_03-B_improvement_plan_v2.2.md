**NN_03-B Pipeline Agent**

Plan de Mejoras v2.1 → v2.2

  ----------------------------------- -----------------------------------
  **Proyecto:**                       Booking Titanium

  **Workflow:**                       NN_03-B_Pipeline_Agent

  **Versión origen:**                 v2.1.0

  **Versión destino:**                v2.2.0

  **Total issues:**                   5 (2 críticos, 3 medios)
  ----------------------------------- -----------------------------------

**Instrucciones para el LLM**

**Este documento es una guía de trabajo paso a paso.** Cada sección
describe un issue que debes corregir en el JSON del workflow
NN_03-B_Pipeline_Agent. Sigue el orden exacto de numeración (del #1 al
#5). No saltes issues ni reordenes los pasos.

**Reglas de aplicación:**

-   Lee el JSON del workflow completo antes de comenzar

-   Aplica los cambios uno por uno, en el orden indicado

-   Después de cada fix, verifica que el JSON siga siendo válido

-   No modifiques nodos que no aparezcan en este documento

-   Preserva todos los IDs de nodos (campo \"id\") sin cambios

-   Preserva todas las conexiones existentes excepto donde se indique
    explícitamente

-   Usa exactamente los nombres de nodos tal como aparecen
    (case-sensitive)

**Resumen de Issues**

  ----------------------------------------------------------------------------
  **\#**   **Issue**                                     **Severidad**
  -------- --------------------------------------------- ---------------------
  **#1**   Central Error Handler usa                     **CRITICO**
           \$input.params.error                          

  **#2**   Format Response crashea en ramas              **CRITICO**
           no-get_services                               

  **#3**   Execute Workflow Trigger sin schema           **MEDIO**
           (passthrough)                                 

  **#4**   similarity_threshold: 0.05 --- demasiado      **MEDIO**
           permisivo                                     

  **#5**   Keywords hardcodeadas sobrescriben output del **MEDIO**
           LLM                                           
  ----------------------------------------------------------------------------

**Issues --- Detalle y Fixes**

  -------- ------------------------------------------------- ---------------
  **#1**   **Central Error Handler usa \$input.params.error  **🔴 CRÍTICO**
           --- API inexistente**                             

  -------- ------------------------------------------------- ---------------

  ------------ ----------------------------------------------------------
  **Nodo       Central Error Handler
  afectado**   

  ------------ ----------------------------------------------------------

**Problema detectado**

El nodo Central Error Handler intenta leer el error con
\$input.params.error. Esta propiedad no existe en la API de Code nodes
de n8n v2.x. La expresión evalúa silenciosamente a undefined, haciendo
que el objeto de error sea siempre {}. Como resultado, el handler
construye un error genérico \"Error desconocido\" en lugar del error
real, imposibilitando el debugging en producción.

**Diagnóstico técnico**

En n8n Code nodes, \$input expone únicamente los métodos .all(),
.first(), .last() y .item. No existe la propiedad .params ni
.params.error. Los errores propagados por otros nodos llegan como parte
del json del item de entrada, no como una propiedad especial de \$input.

**Código ANTES (incorrecto):**

  -----------------------------------------------------------------------
  // ❌ INCORRECTO --- \$input.params no existe

  const input = \$input.first()?.json \|\| {};

  const error = \$input.params.error \|\| {}; // SIEMPRE devuelve {}

  const success = input.success !== false && !error.message;

  const errorCode = error.code \|\| input.error_code \|\|
  \"EXECUTION_ERROR\";

  const errorMessage = error.message \|\| input.error_message \|\|
  \"Error desconocido\";
  -----------------------------------------------------------------------

**Código DESPUÉS (correcto):**

  -----------------------------------------------------------------------
  // ✅ CORRECTO --- leer error del json del item entrante

  const input = \$input.first()?.json \|\| {};

  // Los errores llegan como campos en el json, no en \$input.params

  const errorCode = input.error_code \|\| input.code \|\|
  \"EXECUTION_ERROR\";

  const errorMessage = input.error_message \|\| input.message \|\|
  \"Error desconocido\";

  return \[{

  json: {

  success: false,

  error_code: errorCode,

  error_message: errorMessage,

  data: null,

  \_meta: {

  source: \"NN_03-B_Pipeline_Agent\",

  timestamp: new Date().toISOString(),

  version: \"2.2.0\"

  }

  }

  }\];
  -----------------------------------------------------------------------

**Notas adicionales:** Reemplazar el jsCode completo del nodo \"Central
Error Handler\" con el código correcto. No tocar ninguna otra propiedad
del nodo (id, position, type, typeVersion).

  -------- ------------------------------------------------- ---------------
  **#2**   **Format Response crashea en ramas que no son     **🔴 CRÍTICO**
           get_services**                                    

  -------- ------------------------------------------------- ---------------

  ------------ ----------------------------------------------------------
  **Nodo       Format Response
  afectado**   

  ------------ ----------------------------------------------------------

**Problema detectado**

El nodo Format Response referencia \$(\"Parse:
get_services\").first().json.query directamente dentro del objeto \_meta
(campo debug_topic). Cuando la rama activa es create_booking,
cancel_booking, check_availability, find_next o general_chat, el nodo
\"Parse: get_services\" nunca fue ejecutado. Llamar .first() sobre un
nodo no ejecutado lanza una excepción en el task runner, haciendo que
Format Response falle incluso cuando el LLM respondió correctamente. La
respuesta exitosa del usuario nunca llega al webhook.

**Diagnóstico técnico**

En n8n, referenciar un nodo que no ejecutó con
\$(\"NombreNodo\").first() lanza un error en runtime. La guarda correcta
es verificar primero con .isExecuted, o envolver en try/catch. El campo
debug_topic en \_meta nunca debería bloquear la respuesta al usuario;
debe ser nullable.

**Código ANTES (incorrecto):**

  -----------------------------------------------------------------------
  // ❌ INCORRECTO --- crashea si Parse: get_services no ejecutó

  return \[{

  json: {

  // \...

  \_meta: {

  source: \"NN_03-B_Pipeline_Agent\",

  timestamp: new Date().toISOString(),

  debug_topic: \$(\"Parse: get_services\").first().json.query, // CRASH

  version: \"2.1.0\"

  }

  }

  }\];
  -----------------------------------------------------------------------

**Código DESPUÉS (correcto):**

  -----------------------------------------------------------------------
  // ✅ CORRECTO --- guard con isExecuted + try/catch

  let debugTopic = null;

  try {

  if (\$(\"Parse: get_services\").isExecuted) {

  debugTopic = \$(\"Parse: get_services\").first()?.json?.query ?? null;

  }

  } catch(e) { /\* nodo no ejecutado en esta rama \*/ }

  // Extraer intent de forma igualmente defensiva

  let intent = \"general_chat\";

  try {

  if (\$(\"Intent Normalizer\").isExecuted) {

  intent = \$(\"Intent Normalizer\").first()?.json?.intent ??
  \"general_chat\";

  }

  } catch(e) {}

  return \[{

  json: {

  success: true,

  error_code: null,

  error_message: null,

  data: {

  intent,

  chat_id: chatId,

  ai_response: aiResp

  },

  \_meta: {

  source: \"NN_03-B_Pipeline_Agent\",

  timestamp: new Date().toISOString(),

  debug_topic: debugTopic, // null si no aplica

  version: \"2.2.0\"

  }

  }

  }\];
  -----------------------------------------------------------------------

**Notas adicionales:** Aplicar el mismo patrón defensivo (isExecuted +
try/catch) a TODAS las referencias cruzadas de nodos en Format Response.
Revisar también las referencias a \$(\"Input_Clean\") e \$(\"Intent
Normalizer\") que ya tienen try/catch en el código original --- esos
están bien.

  -------- ------------------------------------------------- ---------------
  **#3**   **Execute Workflow Trigger sin schema ---         **🟡 MEDIO**
           inputSource: \"passthrough\"**                    

  -------- ------------------------------------------------- ---------------

  ------------ ----------------------------------------------------------
  **Nodo       Execute Workflow Trigger
  afectado**   

  ------------ ----------------------------------------------------------

**Problema detectado**

El trigger de sub-workflow está configurado con inputSource:
\"passthrough\", lo que significa que no declara ningún schema de
entrada. Cuando este workflow se invoca como sub-workflow desde otro
workflow padre (por ejemplo, NN_03-A o un orquestador), n8n no puede
validar ni autodocumentar los campos esperados. Esto genera errores
silenciosos difíciles de debuggear cuando el workflow padre envía campos
con nombres incorrectos.

**Diagnóstico técnico**

n8n v2.x soporta inputSource: \"jsonExample\" para declarar
explícitamente el schema esperado. Esto permite que el workflow padre
vea los campos requeridos, habilita la validación automática, y
documenta el contrato de entrada.

**Código ANTES (incorrecto):**

  -----------------------------------------------------------------------
  // ❌ INCORRECTO --- sin schema declarado

  {

  \"parameters\": {

  \"inputSource\": \"passthrough\"

  },

  \"name\": \"Execute Workflow Trigger\",

  \"type\": \"n8n-nodes-base.executeWorkflowTrigger\",

  \"typeVersion\": 1.1

  }
  -----------------------------------------------------------------------

**Código DESPUÉS (correcto):**

  -----------------------------------------------------------------------
  // ✅ CORRECTO --- schema explícito declarado

  {

  \"parameters\": {

  \"inputSource\": \"jsonExample\",

  \"jsonExample\": \"{\\n \\\"chat_id\\\": 12345,\\n \\\"text\\\":
  \\\"Hola, quiero un turno\\\"\\n}\"

  },

  \"name\": \"Execute Workflow Trigger\",

  \"type\": \"n8n-nodes-base.executeWorkflowTrigger\",

  \"typeVersion\": 1.1

  }
  -----------------------------------------------------------------------

**Notas adicionales:** El jsonExample debe incluir todos los campos que
el workflow espera recibir: chat_id (number) y text (string). No es
necesario incluir campos opcionales.

  -------- ------------------------------------------------- ---------------
  **#4**   **similarity_threshold: 0.05 --- umbral demasiado **🟡 MEDIO**
           permisivo**                                       

  -------- ------------------------------------------------- ---------------

  ------------ ----------------------------------------------------------
  **Nodo       Parse: get_services
  afectado**   

  ------------ ----------------------------------------------------------

**Problema detectado**

El nodo Parse: get_services construye el payload para RAG_02 con
similarity_threshold: 0.05. Un umbral de 0.05 significa que documentos
con solo un 5% de similitud coseno con la query del usuario son
considerados relevantes. En la práctica, casi cualquier documento del
índice vectorial calificará, trayendo resultados irrelevantes: una
búsqueda de \"pediatría\" puede retornar documentos de \"política de
cancelación\" o \"seguros de salud\" con similaridad 0.06.

**Diagnóstico técnico**

Con el sistema de archivado ya implementado en RAG_01 y el service_id
filter de Analyze Resolve, el recall ya está cubierto estructuralmente.
No es necesario un threshold tan bajo para compensar falta de
documentos. El rango recomendado para RAG en contexto médico
especializado es 0.30-0.40. Un valor de 0.30 mantiene buen recall
eliminando el ruido.

**Código ANTES (incorrecto):**

  -----------------------------------------------------------------------
  // ❌ INCORRECTO --- threshold demasiado bajo

  return \[{ json: {

  query: q,

  service_name: q,

  provider_id: 1,

  limit: 5,

  similarity_threshold: 0.05 // 5% --- casi cualquier doc califica

  } }\];
  -----------------------------------------------------------------------

**Código DESPUÉS (correcto):**

  -----------------------------------------------------------------------
  // ✅ CORRECTO --- threshold razonable para dominio médico

  return \[{ json: {

  query: q,

  service_name: q,

  provider_id: 1,

  limit: 5,

  similarity_threshold: 0.30 // 30% --- balance recall/precision

  } }\];
  -----------------------------------------------------------------------

**Notas adicionales:** El valor 0.30 es un punto de partida. Monitorear
en producción. Si en los primeros días de operación los usuarios
reportan respuestas incompletas sobre servicios existentes, bajar a
0.20. Si las respuestas incluyen información irrelevante de otros
servicios, subir a 0.40.

  -------- ------------------------------------------------- ---------------
  **#5**   **Keywords hardcodeadas sobrescriben el output    **🟡 MEDIO**
           del LLM**                                         

  -------- ------------------------------------------------- ---------------

  ------------ ----------------------------------------------------------
  **Nodo       Parse: get_services
  afectado**   

  ------------ ----------------------------------------------------------

**Problema detectado**

El nodo Parse: get_services aplica un bloque de keywords hardcodeadas
(cardio, pediat, derma, odont, segu, osde) que sobrescriben
incondicionalmente el valor extraído por Service_Topic_Extractor LLM.
Esto significa que si el LLM ya identificó correctamente \"cardiologia\"
como especialidad, el keyword check lo reemplaza igualmente. Además, las
keywords están incompletas: \"corazón\", \"arritmia\", \"marcapasos\" no
matchean \"cardio\", generando una query vacía que fallback al texto
completo del usuario.

**Diagnóstico técnico**

El correcto orden de prioridad debe ser: (1) si el LLM extrajo un query
válido, usarlo; (2) si el LLM falló o devolvió vacío, aplicar keywords
como fallback; (3) si ninguno funciona, usar el texto completo. El
bloque actual invierte esta prioridad, haciendo que el LLM sirva de
adorno.

**Código ANTES (incorrecto):**

  -----------------------------------------------------------------------
  // ❌ INCORRECTO --- keywords sobrescriben al LLM siempre

  let q = params.query \|\| \"\";

  // Este bloque SIEMPRE ejecuta, aunque el LLM ya respondió bien

  if (userText.includes(\"cardio\")) q = \"cardiologia\";

  else if (userText.includes(\"pediat\")) q = \"pediatria\";

  else if (userText.includes(\"derma\")) q = \"dermatologia\";

  else if (userText.includes(\"odont\")) q = \"odontologia\";

  else if (userText.includes(\"segu\") \|\| userText.includes(\"osde\"))
  q = \"seguros\";

  if (!q) q = \$(\"Input_Clean\").first().json.text;
  -----------------------------------------------------------------------

**Código DESPUÉS (correcto):**

  -----------------------------------------------------------------------
  // ✅ CORRECTO --- LLM tiene prioridad, keywords son fallback

  let q = params.query \|\| \"\"; // Confiar en el LLM primero

  // Solo aplicar keywords si el LLM no devolvió nada útil

  if (!q) {

  const kws = \[

  { test: \[\"cardio\",\"corazón\",\"arritmia\"\], val: \"cardiologia\"
  },

  { test: \[\"pediat\",\"niño\",\"niña\",\"infantil\"\], val:
  \"pediatria\" },

  { test: \[\"derma\",\"piel\",\"acné\"\], val: \"dermatologia\" },

  { test: \[\"odont\",\"diente\",\"dental\",\"muela\"\], val:
  \"odontologia\" },

  { test: \[\"segu\",\"osde\",\"prepaga\",\"cobertura\"\], val:
  \"seguros\" },

  \];

  for (const { test, val } of kws) {

  if (test.some(k =\> userText.includes(k))) { q = val; break; }

  }

  }

  // Último recurso: texto completo del usuario

  if (!q) q = \$(\"Input_Clean\").first().json.text;
  -----------------------------------------------------------------------

**Notas adicionales:** En el mismo nodo Parse: get_services, actualizar
también similarity_threshold de 0.05 a 0.30 (Issue #4). Ambos cambios
están en el mismo nodo y conviene aplicarlos juntos en un único
reemplazo del jsCode.

**Checklist de Verificación Final**

Antes de guardar el JSON corregido, verificar los siguientes puntos:

1.  Central Error Handler: el jsCode no contiene la cadena
    \"\$input.params\" en ninguna parte

2.  Format Response: todas las referencias a nodos externos usan el
    patrón isExecuted + try/catch

3.  Execute Workflow Trigger: inputSource es \"jsonExample\" (no
    \"passthrough\")

4.  Parse: get_services: similarity_threshold es 0.30 (no 0.05)

5.  Parse: get_services: el bloque de keywords está DENTRO del bloque if
    (!q) { \... }

6.  El JSON resultante es válido --- sin comas faltantes, sin llaves sin
    cerrar

7.  Todos los \"id\" de nodos son idénticos al JSON original

8.  Todas las conexiones (\"connections\") están intactas --- no se
    modificó ninguna ruta

*Booking Titanium --- NN_03-B Improvement Plan v2.2*
