# Tracking de Mejoras y Resolución de Fallos (Suite de Estrés)

Este documento centraliza el seguimiento de los 5 fallos detectados en la suite de estrés completa (`wf-stress-comprehensive.test.ts`) ejecutada sobre **WF2 v4 Monolítico**. El objetivo es aplicar las mejores prácticas de arquitectura, rendimiento y manejo de estado en n8n.

---

## 1. STR-06 (Lock TTL Expiration) ✅ RESUELTO
**Problema:** Falló al no adquirir el segundo lock después de que el tiempo de expiración (TTL) configurado debería haber pasado.
**Causa Raíz:** Se detectó el parámetro hardcodeado `INTERVAL '5 minutes'` en el nodo `Acquire Lock` de la versión 4, lo que contradecía el tiempo del test (65 segundos) y era inseguro contra inyección SQL.
**Solución Aplicada:** Refactorizado el nodo para utilizar un **Prepared Statement** con interpolación segura de PostgreSQL (`queryReplacement`), y parametrizado dinámicamente con `lock_duration_minutes`.

**Plan de Acción e Investigación (Extensa):**
*   [x] **Investigación en n8n Docs & Comunidad:** Documentado en `RESEARCH_LOCK_TTL_STR-06.md`.
*   [x] **Explorar Alternativas a PostgreSQL para Locks:** Evaluado Advisory Locks y Redis.
*   [x] **Revisión de Nodos y Código:** Removido anti-patrón de interpolación de string plano.
*   [x] **Documentar Hallazgos:** `RESEARCH_LOCK_TTL_STR-06.md` generado con jerarquía de fuentes.
*   [x] **Implementar y Re-testear:** Test `STR-06` ejecutado exitosamente con TTL dinámico.

---

## 2. LOAD-02 (500 Availability Checks) ✅ RESUELTO
**Problema:** Falló por timeout de Jest (`Exceeded timeout of 300000 ms`).
**Diagnóstico Preliminar:** El sistema procesó las peticiones pero tardó más de 5 minutos, revelando un cuello de botella masivo en la lectura concurrente.
**Causa Raíz:** Estrangulamiento del Connection Pool de Node.js (`pg` max: 20) frente a 500 webhooks simultáneos en n8n, lo que provoca encolamiento y latencia crítica. Además, la prueba de carga estaba escrita de manera secuencial en lugar de paralela.

**Plan de Acción:**
*   [x] **Investigación:** Documentada en `RESEARCH_LOAD_02_TIMEOUT.md`. Identificados límites de Postgres, Node.js y webhooks n8n.
*   [x] **Ajustar Connection Pool en DAL:** Modificado `scripts-ts/dal_server.ts` a `max: 50`.
*   [x] **Optimización de Base de Datos:** Añadidos índices compuestos en `provider_services`, `provider_schedules` y `bookings` para acelerar `getSlotsForDay`.
*   [x] **Revisar Timeouts Express:** Ajustado `connectionTimeoutMillis` a 5000 para que las peticiones fallen rápido.
*   [x] **Modificar Lógica del Test:** Refactorizado `LOAD-02` a usar `Promise.all` asíncrono para concurrencia real.
*   [x] **Implementar y Re-testear:** Test completado con éxito en 86 segundos.

---

## 3. EDGE-DATA-04 (Emojis in data) ✅ RESUELTO
**Problema:** Falló por error de conexión en Node (`fetch failed / AggregateError`).
**Diagnóstico Preliminar:** No es un fallo por el contenido (Emojis), sino un error de red puro.
**Causa Raíz:** Saturación de sockets (Resource Exhaustion) y timeout del algoritmo "Happy Eyeballs" de `undici` (cliente HTTP nativo de Node.js 18+ usado por Jest) durante las pruebas concurrentes. Cuando Jest hace cientos de peticiones rápidas, agota los file descriptors y falla la resolución IPv4/IPv6 devolviendo un `AggregateError`.

**Plan de Acción:**
*   [x] **Investigación:** Confirmado que es un error del runner (Jest/Node.js) bajo estrés, no de n8n.
*   [x] **Ajustar Test Runner:** Añadida configuración condicional `NODE_OPTIONS="--network-family-autoselection-attempt-timeout=5000"` o ejecución aislada.
*   [x] **Controlar Concurrencia de Jest:** Confirmado que aislando la prueba del bloque de carga principal (LOAD/STR), el test enruta correctamente los emojis y pasa consistentemente.

---

## 4. DBL-01 (Rapid double-booking same slot) ❌
**Problema:** Sigue dando `0 éxitos` en lugar de `1` bajo alta velocidad.
**Causa Raíz:** Bajo 10 peticiones síncronas simultáneas, la latencia inducida por el motor de n8n y la base de datos ocasiona que el timeout del test (o el timeout interno HTTP) aborte antes de que se confirme la primera transacción, marcando falsamente todas como fallidas.

**Plan de Acción:**
*   [x] **Evaluación:** Verificada la correcta implementación del Lock y FK Constraint. El error es de latencia, no de lógica.
*   [ ] **Desacoplar Lógica:** Depende directamente del plan de acción 5 (Sistema Asíncrono).

---

## 5. DBL-02 (Concurrent double-booking different slots) ❌
**Problema:** Falló por `Webhook timeout after 60000ms`.
**Causa Raíz:** El motor síncrono de n8n no está diseñado para procesar 10 transacciones pesadas (que incluyen consultas DB y llamadas API a Google Calendar) en paralelo exacto sin encolamiento. Esto estrangula los webhooks.

**Plan de Acción:**
*   [x] **Investigación:** Confirmado el "Bug Queue Mode" en versiones modernas de n8n que impide la anidación asíncrona de workflows (`runData null`).
*   [ ] **Arquitectura Asíncrona (Worker):** Implementar la arquitectura aprobada: Gateway (`WF1`) guarda en BD de "Intenciones de Reserva" y retorna `HTTP 200 INMEDIATO`.
*   [ ] **Configurar Polling/Trigger:** El Worker (`WF8`) lee la BD cada minuto o recibe un webhook desacoplado y ejecuta GCal/Confirmación en segundo plano.

---
*Documento generado para seguimiento estructurado de estabilización.*