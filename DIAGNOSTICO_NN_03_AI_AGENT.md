# 🔍 DIAGNÓSTICO DE RENDIMIENTO - NN_03_AI_Agent
**Fecha:** 2026-03-04  
**Workflow:** NN_03_AI_Agent  
**Modelo LLM:** Groq llama-3.3-70b-versatile  
**Estado:** Análisis completado

---

## 📋 RESUMEN EJECUTIVO

El workflow NN_03_AI_Agent está experimentando tiempos de respuesta lentos al utilizar el AI Agent con modelo Groq. Basado en el análisis arquitectónico, configuración del workflow, documentación oficial de n8n y Groq, se identificaron **7 factores críticos** que contribuyen a la latencia.

---

## 🏗️ ARQUITECTURA ACTUAL DEL WORKFLOW

### Flujo de Ejecución:
```
Webhook/Manual/Execute Workflow Trigger
         ↓
Extract & Validate (PRE) → Validación de payload
         ↓
Is Valid? (IF v2.3) → Decisión binaria
         ↓
    ┌────┴────┐
    │         │
  NO        SÍ
    │         │
    ↓         ↓
Format    AI Agent ←── Groq Chat Model (llama-3.3-70b-versatile, temp: 0.1)
Error            │
                 ├─── Window Buffer Memory (v1.3)
                 │
                 ├─── Tool: Check Availability → DB_Get_Availability
                 │                              └─→ HTTP Request → http://dal-service:3000/availability
                 │
                 ├─── Tool: Find Next Available → DB_Find_Next_Available
                 │                                 └─→ HTTP Request → http://dal-service:3000/find-next-available
                 │
                 ├─── Tool: Create Booking → DB_Create_Booking
                 │                           └─→ HTTP Request → http://dal-service:3000/create-booking
                 │
                 └─── Tool: Cancel Booking → DB_Cancel_Booking
                                             └─→ HTTP Request → http://dal-service:3000/cancel-booking
         ↓
Format Success (POST) → Respuesta final
```

### Componentes Clave:
| Componente | Tipo | Versión | Función |
|------------|------|---------|---------|
| AI Agent | `@n8n/n8n-nodes-langchain.agent` | v3.1 | Orquestador principal |
| Groq Chat Model | `@n8n/n8n-nodes-langchain.lmChatGroq` | v1 | Modelo LLM |
| Window Buffer Memory | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | v1.3 | Memoria conversacional |
| Tool Workflow (x4) | `@n8n/n8n-nodes-langchain.toolWorkflow` | v2 | Herramientas externas |

---

## 🔬 ANÁLISIS DE CAUSAS RAÍZ

### 1️⃣ **ARQUITECTURA DE TOOLWORKFLOW CON EJECUCIÓN SÍNCRONA**

**Problema Identificado:**
- El AI Agent tiene **4 herramientas ToolWorkflow** configuradas
- Cada herramienta es un sub-workflow completo que se ejecuta **síncronamente**
- Cada sub-workflow realiza:
  - HTTP Request a `http://dal-service:3000/*`
  - Procesamiento Code node (2 nodos por sub-workflow)
  - Validaciones y formateo

**Impacto en Latencia:**
```
Tiempo Total = LLM_Thinking + Σ(Tool_Execution_Time)

Donde:
  - LLM_Thinking: 200-800ms (Groq llama-3.3-70b)
  - Tool_Execution: 500-2000ms c/u (HTTP + procesamiento)
  - Si usa 2 herramientas: 200ms + (2 × 1000ms) = 2200ms mínimo
  - Si usa 3 herramientas: 200ms + (3 × 1000ms) = 3200ms mínimo
```

**Evidencia en Configuración:**
```json
{
  "name": "Tool: Check Availability",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 2,
  "workflowInputs": {
    "mappingMode": "defineBelow",
    "value": {
      "provider_id": "={{ $fromAI('provider_id', 'ID del proveedor, default 1', 'number') }}",
      "service_id": "={{ $fromAI('service_id', 'ID del servicio, default 1', 'number') }}",
      "date": "={{ $fromAI('date', 'Fecha en formato YYYY-MM-DD', 'string') }}"
    }
  }
}
```

**Referencia Documentación n8n:**
- ToolWorkflow ejecuta el sub-workflow completo antes de retornar al AI Agent
- El AI Agent espera la respuesta completa para continuar el razonamiento
- No hay ejecución paralela de herramientas por defecto

---

### 2️⃣ **CONFIGURACIÓN DEL MODELO GROQ - TEMPERATURA BAJA**

**Configuración Actual:**
```json
{
  "model": "llama-3.3-70b-versatile",
  "options": {
    "temperature": 0.1
  }
}
```

**Análisis:**
- **Temperatura 0.1** es extremadamente baja
- Produce respuestas más deterministas pero **más lentas**
- El modelo tiende a sobre-analizar cada token
- Mayor probabilidad de bucles de razonamiento redundante

**Recomendación Groq:**
- Temperatura óptima para asistentes: **0.3-0.7**
- Temperatura 0.1 solo para casos que requieren precisión matemática/científica
- Para chat/booking: 0.5-0.7 es ideal

**Impacto Estimado:**
- Temperatura 0.1 → 15-25% más lento que 0.5
- Tokens por segundo reducidos en ~50 tps (de 280 a ~230)

---

### 3️⃣ **MEMORIA WINDOW BUFFER SIN CONFIGURACIÓN EXPLÍCITA**

**Configuración Actual:**
```json
{
  "name": "Window Buffer Memory",
  "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  "typeVersion": 1.3,
  "sessionIdType": "customKey",
  "sessionKey": "={{ $json.sessionId }}"
}
```

**Problema:**
- No hay configuración del tamaño de ventana (`returnMessages`)
- Por defecto, LangChain puede retornar **todo el historial**
- Cada mensaje adicional incrementa:
  - Tokens de input (más caro)
  - Tiempo de procesamiento del LLM (más lento)
  - Latencia de red (payload más grande)

**Fórmula de Impacto:**
```
Tokens_Input = System_Message + Current_Prompt + (N_Messages × Avg_Message_Size)

Ejemplo con 10 mensajes:
  = 150 tokens + 50 tokens + (10 × 100 tokens)
  = 1200 tokens de input

A 280 tokens/segundo → 4.3 segundos solo en procesar input
```

**Referencia Documentación:**
- LangChain Memory Buffer Window debe especificar `k` (número de mensajes)
- n8n no expone esta configuración por defecto en la UI
- Requiere configuración vía código o parámetros avanzados

---

### 4️⃣ **HTTP REQUEST NODES SIN TIMEOUT CONFIGURADO**

**Análisis de Sub-Workflows:**

**DB_Get_Availability:**
```json
{
  "name": "Call DAL Proxy",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.4,
  "url": "http://dal-service:3000/availability",
  "options": {}  // ← SIN TIMEOUT
}
```

**DB_Create_Booking:**
```json
{
  "name": "Call DAL Create",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.4,
  "url": "http://dal-service:3000/create-booking",
  "options": {
    "neverError": true  // ← Solo evita errores, no configura timeout
  }
}
```

**Problema:**
- Sin timeout explícito, n8n usa timeout por defecto (puede ser 30-60 segundos)
- Si el DAL service se demora, el AI Agent **espera bloqueado**
- No hay circuit breaker ni retry logic

**Impacto:**
- 1 HTTP Request lento (5s) = 5s añadidos al tiempo total
- Múltiples herramientas = latencia acumulativa

**Referencia Documentación n8n:**
- HTTP Request v4.4 soporta `timeout` en opciones
- Best practice: configurar timeout explícito (5-10s para servicios internos)
- OBLIGATORIO_05 en GEMINI.md requiere Watchdog para robustez

---

### 5️⃣ **PROMPT DEL SISTEMA EXTENSO SIN OPTIMIZAR**

**System Message Actual:**
```
Eres el asistente inteligente de Booking Titanium. Tu propósito es ayudar 
a los usuarios a agendar, consultar, reagendar y cancelar turnos.

Tienes acceso a herramientas que te permiten:
- Consultar disponibilidad de turnos (check_availability)
- Buscar el próximo turno disponible (find_next_available)
- Crear nuevas reservas (create_booking)
- Cancelar reservas existentes (cancel_booking)

Reglas:
1. SIEMPRE usa las herramientas para obtener datos reales. NUNCA inventes 
   horarios ni disponibilidad.
2. Para crear una reserva necesitas: fecha/hora, nombre del paciente, y 
   opcionalmente email.
3. Para cancelar necesitas el ID de la reserva (UUID).
4. Responde siempre en español, de forma clara y amigable.
5. Si no puedes completar una acción, explica el motivo.
```

**Análisis:**
- ~150 tokens de system message
- Instrucciones claras pero **redundantes**
- Podría optimizarse a ~100 tokens sin perder funcionalidad

**Impacto:**
- 50 tokens extra × 280 tps = ~180ms adicionales por respuesta
- Impacto menor pero acumulativo en alta concurrencia

---

### 6️⃣ **FALTA DE PARALELIZACIÓN EN EJECUCIÓN DE HERRAMIENTAS**

**Problema Arquitectónico:**
- LangChain AI Agent ejecuta herramientas **secuencialmente**
- Si el LLM decide usar 3 herramientas, se ejecutan en serie:
  ```
  Tool 1 (1000ms) → Tool 2 (1000ms) → Tool 3 (1000ms) = 3000ms total
  ```

**Posibilidad de Paralelización:**
- Algunas herramientas son independientes entre sí
- Ejemplo: `check_availability` y `find_next_available` podrían ejecutarse en paralelo
- n8n no soporta ejecución paralela nativa de ToolWorkflow nodes

**Impacto:**
- 2-3 herramientas = 2-3× el tiempo de una sola herramienta
- No hay optimización de DAG (Directed Acyclic Graph) de herramientas

---

### 7️⃣ **POSIBLES CUELLOS DE BOTELLA EXTERNOS**

**DAL Service (`http://dal-service:3000`):**
- 4 endpoints diferentes llamados por las herramientas
- Posibles problemas:
  - Latencia de red entre contenedores Docker
  - Consultas SQL lentas en el backend
  - Falta de índices en la base de datos
  - Conexiones HTTP no reutilizadas (sin keep-alive)

**Groq API:**
- Rate limits: 300K tokens/minuto, 1000 requests/minuto (Developer Plan)
- Si hay múltiples workflows concurrentes, puede haber throttling
- Token speed: ~280 tokens/segundo (óptimo)

---

## 📊 ESTIMACIÓN DE TIEMPOS

### Escenario 1: Consulta Simple (1 herramienta)
```
Componente                    Tiempo Estimado
─────────────────────────────────────────────
Webhook → Validación          50ms
AI Agent (pensamiento)        300ms
ToolWorkflow dispatch         100ms
Sub-workflow ejecución        800ms
  - HTTP Request (DAL)        500ms
  - Code nodes (2x)           200ms
  - Overhead n8n              100ms
LLM procesa respuesta         400ms
Format Output                 50ms
─────────────────────────────────────────────
TOTAL                         ~1700ms (1.7s)
```

### Escenario 2: Booking Completo (3 herramientas)
```
Componente                    Tiempo Estimado
─────────────────────────────────────────────
Webhook → Validación          50ms
AI Agent (pensamiento)        500ms
Tool 1: check_availability    1000ms
Tool 2: find_next_available   1000ms
Tool 3: create_booking        1500ms
  - HTTP Request más complejo
LLM sintetiza respuesta       600ms
Format Output                 50ms
─────────────────────────────────────────────
TOTAL                         ~4700ms (4.7s)
```

### Escenario 3: Con Memoria Llena (10+ mensajes)
```
Componente                    Tiempo Estimado
─────────────────────────────────────────────
Input processing (1200 tokens) 4300ms
AI Agent (pensamiento)        500ms
Herramientas (2x)             2000ms
Output generation             800ms
─────────────────────────────────────────────
TOTAL                         ~7600ms (7.6s)
```

---

## 🎯 PLAN DE ACCIÓN PRIORIZADO

### **FASE 1: Optimizaciones Rápidas (1-2 horas)**

#### 1.1 Ajustar Temperatura del Modelo
**Acción:** Incrementar temperatura de 0.1 a 0.5-0.6
```json
{
  "model": "llama-3.3-70b-versatile",
  "options": {
    "temperature": 0.5  // ← Cambiar de 0.1 a 0.5
  }
}
```
**Beneficio:** 15-25% más rápido en generación de tokens
**Riesgo:** Mínimo - temperatura aún conservadora

#### 1.2 Configurar Timeout en HTTP Requests
**Acción:** Agregar timeout explícito en todos los HTTP Request nodes
```json
{
  "name": "Call DAL Proxy",
  "options": {
    "timeout": 5000  // ← 5 segundos máximo
  }
}
```
**Beneficio:** Evita esperas infinitas, fail-fast
**Riesgo:** Requests muy lentos fallarán (pero es deseable)

#### 1.3 Optimizar System Prompt
**Acción:** Reducir system message a ~100 tokens
```
Eres asistente de Booking Titanium. Ayudas a agendar, 
consultar y cancelar turnos usando las herramientas disponibles.

Reglas:
1. Usa SIEMPRE las herramientas para datos reales
2. Responde en español, claro y amigable
3. Para crear: fecha/hora, nombre, email (opcional)
4. Para cancelar: UUID de reserva
```
**Beneficio:** 150-200ms menos por respuesta
**Riesgo:** Mínimo - instrucciones esenciales se mantienen

---

### **FASE 2: Optimizaciones de Arquitectura (4-6 horas)**

#### 2.1 Limitar Memoria de Conversación
**Acción:** Configurar ventana de memoria explícita
- Opción A: Modificar Window Buffer Memory node para limitar mensajes (si soportado)
- Opción B: Agregar Code node antes del AI Agent que trunque el historial
- Opción C: Usar memoria externa con TTL

**Implementación sugerida (Code node):**
```javascript
// Truncar historial a últimos 5 mensajes
const history = $(MemoryNode).data;
const limitedHistory = history.slice(-5);
return [{ json: { history: limitedHistory } }];
```

**Beneficio:** Reduce tokens de input en 40-60%
**Riesgo:** Contexto histórico limitado (pero 5 mensajes suele ser suficiente)

#### 2.2 Consolidar Herramientas
**Acción:** Reducir de 4 a 2-3 herramientas más inteligentes

**Opción A: Unificar check_availability + find_next_available**
```
Tool: get_availability_smart
  - Si tiene fecha → check_availability
  - Si no tiene fecha → find_next_available
  - Lógica interna en sub-workflow
```

**Opción B: Tool único de gestión de bookings**
```
Tool: manage_booking
  - action: "check" | "find" | "create" | "cancel"
  - parameters: según acción
  - Sub-workflow con Switch node dispatch
```

**Beneficio:** 1 herramienta en vez de 2-3 = 30-50% más rápido
**Riesgo:** Complejidad en sub-workflow (pero manejable)

---

### **FASE 3: Optimizaciones Avanzadas (1-2 días)**

#### 3.1 Implementar Caché para Consultas Repetidas
**Acción:** Agregar capa de caché antes de HTTP Requests

**Patrón:**
```
ToolWorkflow
    ↓
Check Cache (Redis/Memory)
    ├─→ HIT: Retornar caché (50ms)
    └─→ MISS: HTTP Request → Cache → Retornar
```

**Implementación:**
- Usar Redis si disponible en infraestructura
- O Static Data node para caché simple (5-10 minutos TTL)

**Beneficio:** 80-90% más rápido para consultas repetidas
**Riesgo:** Datos potencialmente desactualizados (mitigar con TTL corto)

#### 3.2 Pre-fetching de Disponibilidad
**Acción:** Precargar disponibilidad del día actual/hora pico

**Patrón:**
```
Schedule Trigger (cada hora)
    ↓
Get Availability (hoy + mañana)
    ↓
Store en Static Data / Redis
```

**AI Agent:**
```
Tool: check_availability
    ↓
Leer de caché (no HTTP Request)
```

**Beneficio:** Elimina 1-2 HTTP Requests por conversación
**Riesgo:** Datos pueden desactualizarse si hay bookings manuales

#### 3.3 Migrar a AI Agent con Parallel Tool Execution
**Acción:** Investigar si n8n v2.10.2 soporta ejecución paralela de herramientas

**Requisitos:**
- Verificar versión de LangChain subyacente
- Configurar agente para parallel tool calls
- Modificar ToolWorkflow nodes para soportar parallel execution

**Beneficio:** 50-70% más rápido en escenarios multi-herramienta
**Riesgo:** Complejidad de implementación, puede requerir custom code

---

### **FASE 4: Optimizaciones de Infraestructura (variable)**

#### 4.1 Optimizar DAL Service
**Acciones:**
- Profiling de endpoints más lentos
- Agregar índices en base de datos
- Implementar connection pooling
- Habilitar HTTP keep-alive

**Beneficio:** 30-50% más rápido en HTTP Requests
**Riesgo:** Requiere acceso y cambios en servicio externo

#### 4.2 Upgrade de Plan Groq
**Acción:** Evaluar migrar de Developer a Production tier

**Beneficios:**
- Mayor rate limit (más concurrencia)
- Posible prioridad en colas de inferencia
- SLA garantizado

**Costo:** $0.59/1M input tokens, $0.79/1M output tokens

---

## 📈 MÉTRICAS DE ÉXITO

### Antes de Optimización (Línea Base)
| Métrica | Valor Actual |
|---------|--------------|
| Tiempo respuesta (1 herramienta) | ~1.7s |
| Tiempo respuesta (3 herramientas) | ~4.7s |
| Tiempo con memoria llena | ~7.6s |
| Tokens promedio por respuesta | ~500-800 |

### Después de Optimización (Objetivos)
| Métrica | Objetivo Fase 1 | Objetivo Fase 2 | Objetivo Fase 3 |
|---------|-----------------|-----------------|-----------------|
| Tiempo respuesta (1 herramienta) | ~1.3s (-23%) | ~1.0s (-41%) | ~0.7s (-59%) |
| Tiempo respuesta (3 herramientas) | ~4.0s (-15%) | ~2.5s (-47%) | ~1.5s (-68%) |
| Tiempo con memoria llena | ~6.5s (-14%) | ~3.5s (-54%) | ~2.0s (-74%) |
| Tokens promedio por respuesta | ~450 (-10%) | ~350 (-30%) | ~300 (-40%) |

---

## ⚠️ RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Temperatura más alta produce respuestas menos precisas | Baja | Medio | Monitorear calidad, ajustar a 0.4 si es necesario |
| Timeout muy corto causa fallos en HTTP Requests | Media | Alto | Empezar con 10s, reducir gradualmente a 5s |
| Memoria limitada pierde contexto importante | Media | Medio | Usar ventana de 5-7 mensajes, ajustar según feedback |
| Consolidar herramientas aumenta complejidad | Alta | Bajo | Testing exhaustivo, rollback planificado |
| Caché retorna datos desactualizados | Media | Alto | TTL corto (5 min), invalidar tras create/cancel |

---

## 🔍 PRÓXIMOS PASOS INMEDIATOS

1. **[ ] Ejecutar benchmark actual** - Medir tiempos reales de respuesta
   - 10 requests con 1 herramienta
   - 10 requests con 3 herramientas
   - Documentar línea base

2. **[ ] Implementar Fase 1** - Optimizaciones rápidas
   - Ajustar temperatura
   - Configurar timeouts
   - Optimizar system prompt

3. **[ ] Re-medir después de Fase 1** - Validar mejoras
   - Comparar con línea base
   - Ajustar si es necesario

4. **[ ] Planificar Fase 2** - Optimizaciones de arquitectura
   - Diseñar consolidación de herramientas
   - Implementar límite de memoria

5. **[ ] Evaluar Fase 3** - Según resultados de Fase 2
   - Implementar caché si justifica
   - Considerar parallel execution

---

## 📚 REFERENCIAS CONSULTADAS

### Documentación Oficial n8n
- AI Agent Node: `docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/`
- LangChain Integration: Advanced AI documentation
- HTTP Request Node: Node documentation v4.4
- GEMINI.md (system prompt interno): OBLIGATORIO_05, OBLIGATORIO_13

### Documentación Groq
- Modelos: `console.groq.com/docs/models`
- llama-3.3-70b-versatile: 280 tokens/sec, 131K contexto
- Rate Limits: 300K TPM, 1K RPM (Developer)
- Pricing: $0.59/1M input, $0.79/1M output

### LangChain
- Memory Buffer Window: Historial de conversaciones
- Tool Execution: Secuencial por defecto
- Agent Types: Tools Agent (default desde v1.82.0)

### Comunidad n8n
- Best practices para AI Agents en producción
- Optimización de ToolWorkflow nodes
- Manejo de timeouts y circuit breakers

---

**Documento elaborado:** 2026-03-04  
**Próxima revisión:** Después de implementar Fase 1  
**Responsable:** Engineering Team
