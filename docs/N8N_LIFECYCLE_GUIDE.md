# 🚀 GUÍA MAESTRA: RECURSOS PARA EL CICLO DE VIDA N8N (v1.0)

**Fecha:** 2026-03-10  
**Proyecto:** Booking Titanium  
**Propósito:** Fuentes técnicas validadas para el ciclo completo (Desarrollo -> Escalamiento -> Test -> Debug).

---

## 1. DESARROLLO Y LÓGICA DE NEGOCIO (BOOKING CORE)
*Recursos para asegurar la integridad de las reservas y manejo de tiempo.*

### 🔐 Concurrencia y Double-Booking (Postgres Advisory Locks)
- **Concepto:** Evitar que dos usuarios reserven el mismo slot mediante bloqueos lógicos ligeros.
- **Fuentes:**
    - [PostgreSQL Advisory Locks Guide](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) - Documentación oficial.
    - [Atomic Booking Patterns](https://flaviodelgrosso.com/postgresql-advisory-locks) - Patrones prácticos para reservas.
- **Técnica Validada:** Usar `pg_advisory_xact_lock(hashtext('provider_id' || 'timestamp'))` dentro de un nodo Postgres "Execute Query". Esto bloquea el slot específico solo durante la transacción.

### 🌍 Gestión de Zonas Horarias (Luxon & DST)
- **Concepto:** Manejar cambios de hora (DST) entre la clínica y pacientes internacionales.
- **Fuentes:**
    - [Luxon: Time Zones and DST](https://moment.github.io/luxon/#/zones) - Guía sobre "Wall-clock time" vs "Absolute time".
- **Mejor Práctica:** Almacenar siempre el **Target IANA Timezone** (ej. `America/Argentina/Buenos_Aires`) junto al timestamp UTC para recalcular correctamente tras un cambio de horario estacional.

---

## 2. ESCALAMIENTO E INFRAESTRUCTURA
*Cómo pasar de un prototipo a un sistema de alta disponibilidad.*

### ⚡ Neon Connection Pooling (Port 6543)
- **Concepto:** Manejar cientos de conexiones simultáneas desde workers de n8n.
- **Fuentes:**
    - [Neon Docs: Connection Pooling](https://neon.tech/docs/manage/connection-pooling)
- **Configuración Crítica:** Usar el puerto `6543` con el parámetro `?pgbouncer=true`. 
- **Advertencia:** En este modo no se pueden usar `advisory locks` de sesión; se deben usar los de transacción (`_xact_`).

### 📦 n8n Queue Mode Avanzado
- **Fuentes:** [n8n Scaling Guide](https://docs.n8n.io/hosting/scaling/queue-mode/)
- **Snippet Ops:** Configurar `N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true` en la instancia líder para que solo gestione la UI/Webhooks y deje el trabajo pesado a los Workers.

---

## 3. TESTING Y VALIDACIÓN DE IA
*Asegurar que el Agente de Pipeline no alucine y los tests sean deterministas.*

### 🤖 Evaluación de RAG (RAGAS & DeepEval)
- **Concepto:** Medir la "Fidelidad" y "Relevancia" de las respuestas de la IA.
- **Fuentes:**
    - [DeepEval: Unit Testing for LLMs](https://github.com/confident-ai/deepeval) - Recomendado para CI/CD.
    - [Ragas: Evaluation Framework](https://docs.ragas.io/) - Estándar para métricas de recuperación.
- **Implementación:** Integrar DeepEval en tu suite de Jest para fallar el build si el score de "Faithfulness" baja de 0.8.

### 🎭 Mocking de APIs (WireMock)
- **Concepto:** Probar Telegram y GCal sin consumir cuotas de API ni depender de internet.
- **Fuentes:** [WireMock for Telegram API](http://wiremock.org/docs/solutions/api-mocking/)
- **Técnica:** Redirigir el `BASE_URL` del nodo Telegram a un contenedor local de WireMock que devuelva un `ok: true` simulado.

---

## 4. DEBUGGING Y OBSERVABILIDAD
*Resolución de problemas de red y visibilidad de errores.*

### 🐳 Docker Networking (Inter-container DNS)
- **Problema:** El alias `dal-service` no resuelve.
- **Fuentes:** [Docker DNS Troubleshooting](https://docs.docker.com/network/troubleshooting/)
- **Solución Validada:** Los alias solo funcionan en **User-defined Bridge Networks**. Asegurarse de que n8n y DAL compartan la misma red definida en el `docker-compose.yml` y no la red `bridge` por defecto.

### 🔍 n8n Public API Monitoring
- **Concepto:** Extraer logs de errores de ejecución de forma programática.
- **Fuentes:** [n8n Public API Reference](https://docs.n8n.io/api/api-reference/)
- **Uso:** El script `scripts-ts/n8n_get_execution_error.ts` debe usar el endpoint `/executions` con filtros de status `failed`.

---

## 5. MEJORA CONTINUA (AGENTS & MCP)
*Evolución hacia arquitecturas agenticas puras.*

### 🔌 Model Context Protocol (MCP)
- **Fuentes:** [Anthropic MCP Specification](https://modelcontextprotocol.io/)
- **Implementación n8n:** Usar el nodo `MCP Server Trigger` para exponer tus flujos de DB como herramientas que el AI Agent consuma sin necesidad de nodos `Switch` complejos.

---

*Nota: Este documento expande a `docs/sourceRAG-QWEN.md` integrando el ciclo de vida completo.*
**Mantenido por:** Gemini CLI v4.2
