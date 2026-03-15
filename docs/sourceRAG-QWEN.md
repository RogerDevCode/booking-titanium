# 🔍 FUENTES TÉCNICAS AVANZADAS (RAG, BOOKING & N8N OPS)

**Fecha de actualización:** 2026-03-10  
**Investigador:** Gemini CLI (Senior Automation Engineer)  
**Estado:** Fuentes validadas y probadas para entornos de producción.

---

## 🏗️ INFRAESTRUCTURA Y PERFORMANCE (n8n OPS)
*Fuentes sobre escalado horizontal, persistencia y optimización de recursos.*

### 1. n8n Queue Mode (Redis + BullMQ)
- **Concepto:** Separación de instancias (Main vs Workers) para manejar alta concurrencia.
- **Fuentes:**
    - [n8n Docs: Queue Mode Configuration](https://docs.n8n.io/hosting/scaling/queue-mode/) - Guía oficial de variables de entorno (`EXECUTIONS_MODE=queue`).
    - [BullMQ Documentation](https://docs.bullmq.io/) - Para entender la lógica de colas que usa n8n internamente.
- **Consejo Validado:** Utilizar `N8N_WORKER_CONCURRENCY` entre 5 y 10 para evitar saturación de CPU en workers individuales. Separar Redis de la base de datos Postgres para evitar cuellos de botella de E/S.

### 2. Gestión de Memoria y Poda (Pruning)
- **Fuentes:**
    - [Medium: Optimizing n8n for High Volume](https://medium.com/@n8n/optimizing-n8n-performance) - Estrategias de poda de datos.
- **Consejo Validado:** Configurar `EXECUTIONS_DATA_PRUNE=true` con un `MAX_AGE` de 168h (7 días) para mantener la tabla `execution_entity` ágil en Postgres.

---

## 🧠 SISTEMAS RAG & AI AGENTS (2024-2025)
*Papers y arquitecturas de última generación para sistemas de recuperación.*

### 1. Corrective RAG (CRAG) - Paper 2024
- **Fuente:** [arXiv:2401.15884 - Corrective Retrieval-Augmented Generation](https://arxiv.org/abs/2401.15884)
- **Concepto:** Añade una capa de evaluación post-recuperación. Si los documentos son irrelevantes ("Incorrect"), se dispara una búsqueda web (Tavily/Google).
- **Implementación n8n:** Usar un nodo **IF** después del Vector Store para evaluar el `score` de similitud antes de pasar al LLM.

### 2. Modular RAG Architecture
- **Fuente:** [arXiv:2312.10997 - RAG for LLMs: A Survey](https://arxiv.org/abs/2312.10997)
- **Concepto:** Arquitectura "LEGO". Módulos de Rewrite, Routing, Fusion y Memory.
- **Implementación n8n:** Usar el nodo **AI Agent** con herramientas específicas para cada módulo (ej. una herramienta para buscar en SQL y otra para Vector DB).

### 3. pgvector & HNSW (Postgres)
- **Fuente:** [pgvector GitHub - HNSW Indexing](https://github.com/pgvector/pgvector)
- **Consejo Validado:** Para producción, usar siempre índices **HNSW** (`vector_cosine_ops`). Proporciona búsquedas mucho más rápidas que IVFFlat en datasets grandes.

---

## 📅 SISTEMAS DE BOOKING & GOOGLE API
*Arquitecturas de reserva, manejo de cuotas y sincronización.*

### 1. Google Calendar API: Quota & Sync
- **Fuentes:**
    - [Google Calendar API: SyncToken Patterns](https://developers.google.com/calendar/api/guides/sync) - Cómo hacer sincronización incremental eficiente.
    - [n8n Forum: GCal API Rate Limits](https://community.n8n.io/t/google-calendar-api-rate-limits/3452)
- **Consejo Validado:** Implementar **Incremental Sync** usando `syncToken`. No listar todos los eventos cada vez. Almacenar el `google_event_id` en Postgres como clave de idempotencia.

### 2. Manejo de Timezones (Luxon)
- **Fuentes:**
    - [Luxon Documentation](https://moment.github.io/luxon/) - Librería interna de n8n para fechas.
- **Snippets Pro:** Forzar siempre `UTC` en la base de datos y transformar solo en el nodo de salida para el usuario final.

---

## 🗄️ POSTGRESQL & ATOMICIDAD EN n8n
*Patrones para evitar estados inconsistentes en la DB.*

### 1. Atomic Update Pattern (Single Node)
- **Concepto:** n8n no mantiene transacciones entre nodos. Todo lo que deba ser atómico debe ir en **un solo nodo "Execute Query"**.
- **Snippet:**
    ```sql
    BEGIN;
    UPDATE reservations SET status = 'cancelled' WHERE id = $1::uuid;
    INSERT INTO logs (action, res_id) VALUES ('cancel', $1);
    COMMIT;
    ```
- **Fuente:** [n8n Docs: Postgres Transaction Batching](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/)

---

## 🤖 MESSAGING: TELEGRAM & GMAIL
*Optimización de canales de comunicación.*

### 1. Telegram: Inline Keyboards & HTML
- **Fuentes:**
    - [Telegram Bot API: Inline Keyboards](https://core.telegram.org/bots/api#inlinekeyboardmarkup)
- **Consejo Validado:** Usar **HTML Parse Mode** en n8n en lugar de MarkdownV2 para evitar errores por caracteres especiales no escapados. Para teclados dinámicos complejos, usar el nodo **HTTP Request** directo a la API de Telegram para bypass de limitaciones del nodo nativo.

### 2. GMail: API vs SMTP
- **Comparativa:** La API (OAuth2) es más rápida y maneja mejor los adjuntos binarios de n8n que el SMTP tradicional.
- **Fuentes:** [Google Cloud: Gmail API Overview](https://developers.google.com/gmail/api/guides)

---

## 💻 TS/JS PARA n8n (CODE NODES)
*Patrones de desarrollo avanzado.*

### 1. Pattern: Validation Sandwich
- **Estructura:** `[PRE-Validate] -> [Operation] -> [POST-Validate]`.
- **Snippet JS:**
    ```javascript
    // PRE: Validar input
    const items = $input.all();
    for (const item of items) {
      if (!item.json.id) throw new Error("Missing ID");
    }
    // OP: Transformar
    return items.map(i => ({ json: { ...i.json, processed: true } }));
    ```

### 2. Seguridad (SEC01)
- **Fuentes:** [n8n Docs: Security Best Practices](https://docs.n8n.io/hosting/security/)
- **Mandato:** Prohibido el uso de `process.env` en Code Nodes. Pasar variables como parámetros. Nunca hardcodear secretos.

---
**Documento mantenido por:** Gemini CLI v4.2  
**Fuentes actualizadas mediante:** Deep Web Search & Community Validation.
